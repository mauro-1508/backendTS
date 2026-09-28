"""
Lleva LSC-54 al mismo formato que produce extract_landmarks.py desde video.

LSC-54 ya trae landmarks extraidos con MediaPipe (manos, torso y cara), asi que
no hay video que procesar: solo hay que renormalizarlos al marco de los hombros
y armar la secuencia igual que para LSC50.

Entrada: los .jsonl que deja download-lsc54-rep0.ts, con r_hand, l_hand y pose
por frame en formato de columnas ({"x": [...], "y": [...], "z": [...]}).

Uso:
    python convert_lsc54.py --rep0 ../datasets/lsc54/rep0 --out ../datasets/lsc54/lsc54.jsonl
"""

from __future__ import annotations

import argparse
import json
import os

import numpy as np

from extract_landmarks import (
    FEATURE_DIM,
    POSE_LEFT_SHOULDER,
    POSE_LEFT_WRIST,
    POSE_RIGHT_SHOULDER,
    POSE_RIGHT_WRIST,
    _active_span,
    _normalise,
    _resample,
)

# ---------------------------------------------------------------- lectura


def _to_array(part: dict | None) -> np.ndarray | None:
    """Columnas {x, y, z} -> matriz (n, 3). None si falta o trae nulos."""
    if not part:
        return None
    xs, ys, zs = part.get("x"), part.get("y"), part.get("z")
    if not xs or any(v is None for v in xs) or any(v is None for v in ys) or any(v is None for v in zs):
        return None
    return np.array([xs, ys, zs], dtype=np.float32).T


def is_filler(hand: np.ndarray | None) -> bool:
    """
    Los autores de LSC-54 rellenaron las manos no detectadas copiando 4 puntos
    del torso en las 21 posiciones. Esas manos no son reales y hay que
    descartarlas: se reconocen porque tienen 4 posiciones distintas o menos.
    """
    if hand is None:
        return True
    return len({(round(float(x), 6), round(float(y), 6)) for x, y in hand[:, :2]}) <= 4


def assign_by_pose(r_hand: np.ndarray | None, l_hand: np.ndarray | None, pose: np.ndarray) -> tuple:
    """
    Reasigna las manos por cercania a las munecas del torso.

    No se confia en los nombres del dataset: medido sobre LSC-54, su `r_hand`
    corresponde a la muneca que MediaPipe Pose llama izquierda. Aplicando aqui
    la misma regla que en la extraccion de video, los dos datasets quedan con
    el mismo criterio.
    """
    right_wrist = pose[POSE_RIGHT_WRIST][:2]
    left_wrist = pose[POSE_LEFT_WRIST][:2]

    right = left = None
    for hand in (r_hand, l_hand):
        if hand is None:
            continue
        wrist = hand[0][:2]
        if np.linalg.norm(wrist - right_wrist) <= np.linalg.norm(wrist - left_wrist):
            right = hand if right is None else right
        else:
            left = hand if left is None else left
    return right, left


# ---------------------------------------------------------------- conversion


def build_record(sample: dict) -> dict | None:
    """Una muestra rep_0 -> el mismo registro de 30 x 128 que da el video."""
    rows: list[np.ndarray] = []
    last = {"right": None, "left": None}
    present = [0, 0]

    for frame in sample["frames"]:
        pose = _to_array(frame.get("pose"))
        if pose is None:
            continue
        ls, rs = pose[POSE_LEFT_SHOULDER][:2], pose[POSE_RIGHT_SHOULDER][:2]
        centre = (ls + rs) / 2.0
        scale = float(np.linalg.norm(ls - rs))
        if scale <= 0:
            continue

        r_hand = _to_array(frame.get("r_hand"))
        l_hand = _to_array(frame.get("l_hand"))
        r_hand = None if is_filler(r_hand) else r_hand
        l_hand = None if is_filler(l_hand) else l_hand
        right, left = assign_by_pose(r_hand, l_hand, pose)

        row = np.zeros(FEATURE_DIM, dtype=np.float32)
        for slot, (name, hand) in enumerate((("right", right), ("left", left))):
            if hand is None:
                hand = last[name]
            else:
                last[name] = hand
                present[slot] += 1
            row[slot * 63:(slot + 1) * 63] = _normalise(hand, centre, scale)
            row[126 + slot] = 1.0 if hand is not None else 0.0
        rows.append(row)

    if len(rows) < 8:
        return None

    stacked = np.stack(rows)
    start, end = _active_span(stacked)
    sequence = _resample(stacked[start:end + 1])

    return {
        "dataset": "lsc54",
        "signer": sample["signer"],
        "sign_id": sample["sign"],
        "take": sample.get("vid", "?"),
        "source_clip": f"{sample['signer']}/{sample['sign']}/{sample.get('vid', '?')}",
        "fps_original": 30,
        "frames_read": len(sample["frames"]),
        "hands_present": present,
        "frames": np.round(sequence, 5).tolist(),
    }


def load_rep0(folder: str) -> list[dict]:
    """
    Lee los .jsonl del descargador y reconstruye la ruta de cada muestra.

    La cadena de claves solo trae los niveles que se abren en ese punto, asi
    que firmante y sena se arrastran de la muestra anterior (misma logica que
    lsc54-rep0.ts en el backend).
    """
    state_path = os.path.join(folder, "state.json")
    workers = json.load(open(state_path, encoding="utf-8"))["workers"] if os.path.exists(state_path) else []

    samples: list[dict] = []
    inherited: list[str | None] | None = None

    for w in workers:
        path = os.path.join(folder, f"worker-{w['id']:02d}.jsonl")
        if not os.path.exists(path):
            continue

        records = []
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # linea a medio escribir
        records.sort(key=lambda r: r["offset"])

        parts: list[str | None] = list(inherited) if inherited else [None, None, None, None]
        for rec in records:
            chain = rec["chain"]
            parts = chain[-4:] if len(chain) >= 4 else parts[: 4 - len(chain)] + chain
            if not parts[2]:
                continue
            samples.append({
                "signer": parts[0] or f"tramo_{w['id']}_inicio",
                "category": parts[1] or "desconocida",
                "sign": parts[2],
                "vid": parts[3] or "vid_?",
                "frames": rec["frames"],
            })
        inherited = parts if w.get("done") else None

    return samples


def main() -> None:
    ap = argparse.ArgumentParser(description="Convierte LSC-54 al formato de entrada del modelo")
    ap.add_argument("--rep0", required=True, help="carpeta con los worker-XX.jsonl")
    ap.add_argument("--out", required=True, help="archivo .jsonl de salida")
    args = ap.parse_args()

    samples = load_rep0(args.rep0)
    print(f"{len(samples)} muestras leidas de {args.rep0}")

    written = skipped = 0
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        for s in samples:
            record = build_record(s)
            if record is None:
                skipped += 1
                continue
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1

    print(f"{written} clips escritos en {args.out} ({skipped} sin frames utiles)")


if __name__ == "__main__":
    main()
