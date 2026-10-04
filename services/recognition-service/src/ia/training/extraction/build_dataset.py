"""
Arma el dataset de entrenamiento a partir de los .jsonl de cada fuente.

Hace cuatro cosas:
  1. Unifica etiquetas con labels.json (clase del dataset -> glosa).
  2. Divide en train/val/test POR SENANTE, nunca al azar: si la misma persona
     aparece en entrenamiento y en prueba, la exactitud medida es mentira.
  3. Aumenta solo el conjunto de entrenamiento.
  4. Guarda todo en un .npz listo para el notebook de entrenamiento.

Uso:
    python build_dataset.py --plantilla-labels          # genera labels.json vacio
    python build_dataset.py --out ../datasets/dataset.npz
"""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict

import numpy as np

DEFAULT_SOURCES = [
    ("lsc54", "../datasets/lsc54/lsc54.jsonl"),
    ("lsc50", "../datasets/lsc50/muestra.jsonl"),
]
LABELS_PATH = "labels.json"

# Proporciones de senantes por conjunto. Se reparten personas, no clips.
VAL_RATIO = 0.2
TEST_RATIO = 0.2


# ---------------------------------------------------------------- lectura


def load_source(name: str, path: str) -> list[dict]:
    if not os.path.exists(path):
        print(f"  {name}: {path} no existe, se omite")
        return []
    records = [json.loads(line) for line in open(path, encoding="utf-8") if line.strip()]
    for r in records:
        r["dataset"] = name
    print(f"  {name}: {len(records)} clips")
    return records


def write_labels_template(records: list[dict]) -> None:
    """
    Deja un labels.json con todas las clases encontradas.

    LSC-54 nombra sus senas en espanol, asi que se rellenan solas. LSC50 las
    numera (0000..0049) y su publicacion no dice a que palabra corresponde
    cada numero: esas quedan en null para completar a mano.
    """
    plantilla: dict[str, dict[str, str | None]] = defaultdict(dict)
    for r in records:
        clase = str(r["sign_id"])
        ya = plantilla[r["dataset"]].get(clase)
        if ya is None:
            # Una clase con nombre en palabras es su propia glosa; un id numerico no.
            plantilla[r["dataset"]][clase] = clase.lower() if not clase.isdigit() else None

    with open(LABELS_PATH, "w", encoding="utf-8") as fh:
        json.dump(plantilla, fh, ensure_ascii=False, indent=2, sort_keys=True)

    faltan = sum(1 for d in plantilla.values() for v in d.values() if v is None)
    print(f"\n{LABELS_PATH} generado: {sum(len(d) for d in plantilla.values())} clases, {faltan} sin glosa")


# ---------------------------------------------------------------- division


def split_by_signer(records: list[dict], seed: int = 7) -> dict[str, list[dict]]:
    """
    Reparte SENANTES (no clips) entre train, val y test, dataset por dataset.

    Se hace por dataset para que los tres conjuntos tengan gente de todas las
    fuentes; si no, val podria quedar con puros senantes de LSC50 y medir otra
    cosa.
    """
    rng = np.random.default_rng(seed)
    split: dict[str, list[dict]] = {"train": [], "val": [], "test": []}

    por_dataset: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        por_dataset[r["dataset"]].append(r)

    for dataset, items in sorted(por_dataset.items()):
        senantes = sorted({r["signer"] for r in items})
        rng.shuffle(senantes)

        n_val = max(1, round(len(senantes) * VAL_RATIO)) if len(senantes) >= 3 else 0
        n_test = max(1, round(len(senantes) * TEST_RATIO)) if len(senantes) >= 3 else 0
        grupos = {
            "val": set(senantes[:n_val]),
            "test": set(senantes[n_val:n_val + n_test]),
            "train": set(senantes[n_val + n_test:]),
        }
        for conjunto, gente in grupos.items():
            split[conjunto].extend(r for r in items if r["signer"] in gente)

        print(f"  {dataset}: {len(senantes)} senantes -> "
              f"train {sorted(grupos['train'])}, val {sorted(grupos['val'])}, test {sorted(grupos['test'])}")

    return split


# ---------------------------------------------------------------- aumento


def mirror(frames: np.ndarray) -> np.ndarray:
    """
    Refleja la sena: intercambia las manos y cambia el signo de x.

    Con el origen en el centro de los hombros, reflejar es exactamente eso. Da
    ejemplos de la misma sena hecha con la otra mano, que es como la haria una
    persona zurda.
    """
    out = frames.copy()
    out[:, :63], out[:, 63:126] = frames[:, 63:126].copy(), frames[:, :63].copy()
    out[:, 126], out[:, 127] = frames[:, 127].copy(), frames[:, 126].copy()
    out[:, 0:126:3] *= -1.0
    return out


def time_warp(frames: np.ndarray, factor: float) -> np.ndarray:
    """Estira o encoge la sena en el tiempo, manteniendo los 30 frames."""
    n = len(frames)
    src = np.linspace(0.0, 1.0, num=n)
    dst = np.clip(np.linspace(0.0, 1.0, num=n) ** factor, 0.0, 1.0)
    out = np.stack([np.interp(dst, src, frames[:, c]) for c in range(frames.shape[1])], axis=1)
    out[:, 126:] = frames[np.clip(np.round(dst * (n - 1)).astype(int), 0, n - 1), 126:]
    return out.astype(np.float32)


def jitter(frames: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Escala y desplaza un poco: simula otra distancia y posicion frente a la camara."""
    out = frames.copy()
    escala = float(rng.uniform(0.9, 1.1))
    desplazamiento = rng.uniform(-0.05, 0.05, size=2).astype(np.float32)
    out[:, 0:126:3] = out[:, 0:126:3] * escala + desplazamiento[0]
    out[:, 1:126:3] = out[:, 1:126:3] * escala + desplazamiento[1]
    out[:, 2:126:3] *= escala
    # Donde no habia mano no debe aparecer una: se restauran los ceros.
    ausente = frames[:, :126] == 0
    out[:, :126][ausente] = 0.0
    return out


def augment(frames: np.ndarray, rng: np.random.Generator) -> list[np.ndarray]:
    """Variantes de un clip de entrenamiento (el original va aparte)."""
    return [
        mirror(frames),
        time_warp(frames, 1.25),
        time_warp(frames, 0.8),
        jitter(frames, rng),
    ]


# ---------------------------------------------------------------- salida


def main() -> None:
    ap = argparse.ArgumentParser(description="Arma el dataset unificado")
    ap.add_argument("--out", default="../datasets/dataset.npz")
    ap.add_argument("--plantilla-labels", action="store_true", help="solo generar labels.json y salir")
    ap.add_argument("--sin-aumento", action="store_true")
    ap.add_argument("--min-senantes", type=int, default=2,
                    help="glosas con menos senantes que esto se descartan (no se pueden dividir)")
    args = ap.parse_args()

    print("Fuentes:")
    records: list[dict] = []
    for name, path in DEFAULT_SOURCES:
        records.extend(load_source(name, path))
    if not records:
        raise SystemExit("No hay datos de entrada")

    if args.plantilla_labels:
        write_labels_template(records)
        return

    if not os.path.exists(LABELS_PATH):
        raise SystemExit(f"Falta {LABELS_PATH}. Generalo con --plantilla-labels y completa las glosas.")
    labels = json.load(open(LABELS_PATH, encoding="utf-8"))

    # Clases sin glosa: se dejan fuera y se avisa, en vez de entrenar con un id.
    usables, sin_glosa = [], set()
    for r in records:
        glosa = labels.get(r["dataset"], {}).get(str(r["sign_id"]))
        if not glosa:
            sin_glosa.add(f"{r['dataset']}:{r['sign_id']}")
            continue
        r["gloss"] = glosa
        usables.append(r)

    if sin_glosa:
        print(f"\n{len(sin_glosa)} clases sin glosa quedan fuera: {sorted(sin_glosa)[:6]}"
              f"{' ...' if len(sin_glosa) > 6 else ''}")

    # Una clase grabada por una sola persona cae entera en un conjunto: el
    # modelo nunca la ve en entrenamiento, o nunca se evalua. Se descarta antes
    # de dividir y se avisa cuales fueron.
    senantes_por_glosa: dict[str, set[str]] = defaultdict(set)
    for r in usables:
        senantes_por_glosa[r["gloss"]].add(f"{r['dataset']}:{r['signer']}")

    pocas = {g for g, s in senantes_por_glosa.items() if len(s) < args.min_senantes}
    if pocas:
        print(f"\n{len(pocas)} glosas con menos de {args.min_senantes} senantes quedan fuera: "
              f"{sorted(pocas)[:8]}{' ...' if len(pocas) > 8 else ''}")
        usables = [r for r in usables if r["gloss"] not in pocas]

    print("\nDivision por senante:")
    split = split_by_signer(usables)

    glosas = sorted({r["gloss"] for r in usables})
    indice = {g: i for i, g in enumerate(glosas)}
    rng = np.random.default_rng(7)

    salida: dict[str, np.ndarray] = {}
    for conjunto, items in split.items():
        X, y, senantes = [], [], []
        for r in items:
            frames = np.array(r["frames"], dtype=np.float32)
            X.append(frames)
            y.append(indice[r["gloss"]])
            senantes.append(f"{r['dataset']}:{r['signer']}")
            if conjunto == "train" and not args.sin_aumento:
                for variante in augment(frames, rng):
                    X.append(variante)
                    y.append(indice[r["gloss"]])
                    senantes.append(f"{r['dataset']}:{r['signer']}")
        salida[f"X_{conjunto}"] = np.array(X, dtype=np.float32) if X else np.zeros((0, 30, 128), np.float32)
        salida[f"y_{conjunto}"] = np.array(y, dtype=np.int64)
        salida[f"signers_{conjunto}"] = np.array(senantes)
        print(f"  {conjunto}: {len(X)} secuencias de {len({*senantes})} senantes")

    salida["glosses"] = np.array(glosas)

    # Aviso final: una glosa sin muestras de entrenamiento no se puede aprender,
    # y una sin muestras de prueba no se puede evaluar.
    for conjunto in ("train", "test"):
        vistas = set(salida[f"y_{conjunto}"].tolist())
        faltan = [g for i, g in enumerate(glosas) if i not in vistas]
        if faltan:
            print(f"  aviso: {len(faltan)} glosas sin muestras en {conjunto}: "
                  f"{faltan[:6]}{' ...' if len(faltan) > 6 else ''}")

    np.savez_compressed(args.out, **salida)
    print(f"\n{len(glosas)} glosas -> {args.out} ({os.path.getsize(args.out)/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
