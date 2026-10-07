"""
Baja de LSC-54 solo lo que sirve, usando peticiones HTTP por rangos.

`datos.json` pesa 55 GB, pero la mayor parte es desechable:

  - Las `rep_n` de un video son la misma grabacion desplazada en x (aumentacion
    del dataset). Despues de normalizar quedan identicas, asi que solo se baja
    la `rep_0` de cada video.
  - La cara ocupa el 84 % de los bytes de cada frame y el modelo no la usa.
    Se descarta al guardar.

El archivo se reparte en tramos y cada hilo recorre el suyo: busca la clave
`"rep_0": {`, lee ese objeto contando llaves y salta al siguiente video sin
leerlo. Recorrer un video sin bajarlo cuesta alrededor del 2 % de sus bytes.

Es reanudable: el avance se guarda en state.json cada 30 segundos.

Uso:
    python download_lsc54.py --out ../datasets/lsc54/rep0 --workers 8
    python download_lsc54.py --out ... --solo bienvenido,baño   # solo esas senas
    python download_lsc54.py --out ... --max-samples 500

La salida son worker-XX.jsonl con {offset, chain, frames}, el mismo formato que
lee convert_lsc54.py.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import requests

FILE_URL = "https://china.scidb.cn/download?fileId=bef1a180dba2259b3bcd7de6bc62e3df"
FILE_SIZE = 55_178_894_680

SCAN_WINDOW = 256 * 1024
READ_CHUNK = 4 * 1024 * 1024
CHAIN_CONTEXT = 2048
STEP_FRACTION = 0.985
RATE_LIMIT_WAIT = 60

KEPT_PARTS = ("r_hand", "l_hand", "pose")

REP_RE = re.compile(rb'"rep_(\d+)":\s*\{')
CHAIN_RE = re.compile(rb'((?:"[^"]+":\s*\{\s*)+)$')
KEY_RE = re.compile(r'"([^"]+)":')

_print_lock = threading.Lock()
_state_lock = threading.Lock()


def log(worker: int, message: str) -> None:
    with _print_lock:
        print(f"{time.strftime('%H:%M:%S')} [w{worker:02d}] {message}", flush=True)


# ---------------------------------------------------------------- red


def fetch_range(session: requests.Session, start: int, end: int) -> bytes:
    """
    Trae los bytes [start, end], con reintentos.

    Un 429 ("vas muy rapido") no gasta intentos: se espera lo que pida el
    servidor y se insiste, porque el bloqueo es temporal.
    """
    last = min(end, FILE_SIZE - 1)
    intentos = esperas = 0
    while True:
        try:
            res = session.get(
                FILE_URL,
                headers={"Range": f"bytes={start}-{last}", "User-Agent": "Mozilla/5.0"},
                timeout=180,
            )
            if res.status_code in (429, 503):
                esperas += 1
                if esperas > 30:
                    raise RuntimeError(f"HTTP {res.status_code} persistente")
                time.sleep(max(RATE_LIMIT_WAIT, int(res.headers.get("retry-after", 0) or 0)))
                continue
            if res.status_code != 206:
                raise RuntimeError(f"HTTP {res.status_code}")
            if len(res.content) != last - start + 1:
                raise RuntimeError(f"lectura corta {len(res.content)}/{last - start + 1}")
            return res.content
        except Exception:
            intentos += 1
            if intentos >= 10:
                raise
            time.sleep(min(60, 2 ** intentos))


# ---------------------------------------------------------------- busqueda


def scan_next_rep(session: requests.Session, pos: int) -> dict | None:
    """
    Primera clave `"rep_N": {` desde `pos`.

    Devuelve {"n", "key_pos"} y, cuando es rep_0, tambien la cadena de claves
    que se abren ahi (firmante / categoria / sena / video).
    """
    carry, carry_start, cur = b"", pos, pos
    while cur < FILE_SIZE:
        chunk = fetch_range(session, cur, cur + SCAN_WINDOW - 1)
        buf = carry + chunk
        m = REP_RE.search(buf)
        if m:
            n = int(m.group(1))
            key_pos = carry_start + m.start()
            if n != 0:
                return {"n": n, "key_pos": key_pos}

            before = buf[: m.start()]
            if len(before) < CHAIN_CONTEXT and key_pos > CHAIN_CONTEXT:
                before = fetch_range(session, key_pos - CHAIN_CONTEXT, key_pos - 1)
            chain_match = CHAIN_RE.search(before)
            # Los nombres llevan tildes y n: la cadena se decodifica en UTF-8,
            # aunque el rastreo se haga sobre bytes.
            chain_text = chain_match.group(1).decode("utf-8", errors="replace") if chain_match else ""
            return {
                "n": 0,
                "key_pos": key_pos,
                "obj_start": key_pos + len(m.group(0)) - 1,
                "chain": KEY_RE.findall(chain_text),
            }

        carry = buf[-64:]
        carry_start = cur + len(chunk) - len(carry)
        cur += len(chunk)
    return None


def read_object(session: requests.Session, obj_start: int) -> tuple[str, int]:
    """Lee el objeto que empieza en `obj_start` contando llaves."""
    partes: list[bytes] = []
    depth = 0
    cur = obj_start
    while cur < FILE_SIZE:
        chunk = fetch_range(session, cur, cur + READ_CHUNK - 1)
        for i, byte in enumerate(chunk):
            if byte == 0x7B:  # {
                depth += 1
            elif byte == 0x7D:  # }
                depth -= 1
                if depth == 0:
                    partes.append(chunk[: i + 1])
                    return b"".join(partes).decode("utf-8", errors="replace"), cur + i + 1
        partes.append(chunk)
        cur += len(chunk)
    raise RuntimeError(f"objeto sin cerrar desde {obj_start}")


def compact(rep: dict) -> list[dict]:
    """Deja solo manos y pose, redondeando a 5 decimales."""
    def redondear(valores):
        return [None if v is None else round(v, 5) for v in valores]

    frames = []
    for clave in sorted(rep, key=lambda k: int(k.split("_")[1])):
        frame = rep[clave]
        frames.append({
            parte: ({"x": redondear(c["x"]), "y": redondear(c["y"]), "z": redondear(c["z"])} if (c := frame.get(parte)) else None)
            for parte in KEPT_PARTS
        })
    return frames


# ---------------------------------------------------------------- trabajador


class Descarga:
    def __init__(self, out_dir: str, workers: int, only: list[str], max_samples: int,
                 max_por_sena: int = 0):
        self.out_dir = out_dir
        self.only = [s.lower() for s in only]
        self.max_samples = max_samples
        # Tope por sena: 30 grabaciones alcanzan para entrenar y evita bajar
        # 53 de unas y 20 de otras, que desbalancea las clases.
        self.max_por_sena = max_por_sena
        self.state_path = os.path.join(out_dir, "state.json")
        os.makedirs(out_dir, exist_ok=True)

        if os.path.exists(self.state_path):
            self.state = json.load(open(self.state_path, encoding="utf-8"))
            print(f"retomando: {sum(w['samples'] for w in self.state['workers'])} muestras ya bajadas")
            self.state.setdefault("por_sena", {})
        else:
            tamano = FILE_SIZE // workers
            self.state = {"url": FILE_URL, "workers": [
                {"id": i, "start": i * tamano, "end": min(FILE_SIZE, (i + 1) * tamano),
                 "pos": i * tamano, "done": False, "samples": 0, "bytes": 0}
                for i in range(workers)
            ], "por_sena": {}}
        self.stopping = False
        self.last_save = 0.0

    def total(self) -> int:
        return sum(w["samples"] for w in self.state["workers"])

    def save(self, force: bool = False) -> None:
        with _state_lock:
            if not force and time.time() - self.last_save < 30:
                return
            tmp = self.state_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self.state, fh, indent=2)
            os.replace(tmp, self.state_path)
            self.last_save = time.time()

    def run_worker(self, w: dict) -> None:
        session = requests.Session()
        out_path = os.path.join(self.out_dir, f"worker-{w['id']:02d}.jsonl")
        partes: list[str | None] = [None, None, None, None]
        last_key = rep_size = last_n = None
        skipping = False

        while not w["done"] and not self.stopping:
            res = scan_next_rep(session, w["pos"])
            if res is None:
                w["done"] = True
                break

            if res["n"] != 0:
                if res["key_pos"] >= w["end"]:
                    w["done"] = True
                    break

                # Pasar por encima de una rep_n intermedia no cuesta nada: lo
                # unico que no se puede perder es una rep_0. Por eso el paso se
                # calcula con el MENOR tamano de rep visto hasta ahora: si el
                # paso siempre es mas corto que una rep, es imposible brincar
                # una frontera. Estimarlo "al promedio" fallaba: una medida
                # contaminada agrandaba el salto y se saltaba videos enteros.
                if last_key is not None and res["key_pos"] > last_key and last_n is not None:
                    reps_cruzadas = max(1, res["n"] - last_n)
                    medida = (res["key_pos"] - last_key) // reps_cruzadas
                    rep_size = medida if rep_size is None else min(rep_size, medida)

                last_key, last_n = res["key_pos"], res["n"]
                w["pos"] = res["key_pos"] + int(rep_size * STEP_FRACTION) if rep_size else res["key_pos"] + 1
                if skipping:
                    self.save()
                continue

            if res["key_pos"] >= w["end"]:
                w["done"] = True
                break

            chain = res["chain"]
            partes = chain[-4:] if len(chain) >= 4 else partes[: 4 - len(chain)] + chain
            sena = (partes[2] or "").lower()

            # Ya hay suficientes de esta sena: se salta como las no pedidas.
            completa = (self.max_por_sena > 0
                        and self.state["por_sena"].get(sena, 0) >= self.max_por_sena)

            if (self.only and sena not in self.only) or completa:
                last_key, last_n, skipping = res["key_pos"], 0, True
                w["pos"] = res["key_pos"] + int(rep_size * STEP_FRACTION) if rep_size else res["key_pos"] + 1
                self.save()
                continue

            skipping = False
            texto, fin = read_object(session, res["obj_start"])
            frames = compact(json.loads(texto))
            with open(out_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"offset": res["key_pos"], "chain": chain, "frames": frames},
                                    ensure_ascii=False) + "\n")

            last_key, last_n = res["key_pos"], 0
            rep_size = fin - res["key_pos"]
            with _state_lock:
                self.state["por_sena"][sena] = self.state["por_sena"].get(sena, 0) + 1
            w["samples"] += 1
            w["bytes"] += fin - res["obj_start"]
            w["pos"] = fin
            self.save(force=True)

            log(w["id"], f"{'/'.join(p for p in partes if p)} {len(frames)} frames, "
                         f"{(fin - res['obj_start']) / 1e6:.1f} MB | total {self.total()}")

            if self.total() >= self.max_samples:
                log(w["id"], f"tope de {self.max_samples} muestras alcanzado")
                self.stopping = True
                break

        self.save(force=True)

    def run(self) -> None:
        pendientes = [w for w in self.state["workers"] if not w["done"]]
        print(f"LSC-54: {len(pendientes)} tramos pendientes de {len(self.state['workers'])}")
        with ThreadPoolExecutor(max_workers=len(pendientes)) as pool:
            for w, error in zip(pendientes, pool.map(self._safe, pendientes)):
                if error:
                    log(w["id"], f"ERROR {error}")
        self.save(force=True)
        print(f"\nlisto: {self.total()} muestras en {self.out_dir}")

    def _safe(self, w: dict) -> str | None:
        try:
            self.run_worker(w)
            return None
        except Exception as err:  # un tramo caido no debe tumbar a los demas
            return str(err)


def main() -> None:
    ap = argparse.ArgumentParser(description="Descarga selectiva de LSC-54 por rangos HTTP")
    ap.add_argument("--out", default="../datasets/lsc54/rep0")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--solo", default="", help="senas separadas por coma; vacio = todas")
    ap.add_argument("--max-samples", type=int, default=10**9)
    ap.add_argument("--max-por-sena", type=int, default=0,
                    help="deja de bajar una sena al llegar a N grabaciones (0 = sin tope)")
    args = ap.parse_args()

    only = [s.strip() for s in args.solo.split(",") if s.strip()]
    if only:
        print(f"bajando unicamente: {', '.join(only)}")
    if args.max_por_sena:
        print(f"tope de {args.max_por_sena} grabaciones por sena")
    Descarga(args.out, args.workers, only, args.max_samples, args.max_por_sena).run()


if __name__ == "__main__":
    main()
