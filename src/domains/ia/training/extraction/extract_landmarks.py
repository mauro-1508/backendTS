"""
Extrae landmarks de videos al formato de entrada del modelo.

El contrato esta en docs/06-data/model-input-format.md: 30 frames por clip,
128 valores por frame (2 manos x 21 puntos x xyz, mas una bandera de presencia
por mano), normalizados al centro y la distancia de los hombros.

Se usa para LSC50 y para cualquier dataset que venga en video. LSC-54 no pasa
por aqui: ya trae los landmarks y solo hay que renormalizarlos.

Uso:
    python extract_landmarks.py --videos <carpeta> --out <salida.jsonl>
    python extract_landmarks.py --videos <carpeta> --out <salida.jsonl> --limit 20

En Colab se importa como modulo:
    from extract_landmarks import extract_clip, SEQ_LEN, FEATURE_DIM
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.request
from dataclasses import dataclass

import cv2
import numpy as np

# MediaPipe escribe avisos de su motor interno en cada frame; no aportan nada
# aqui y tapan la salida util.
os.environ.setdefault("GLOG_minloglevel", "2")

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# ---------------------------------------------------------------- contrato

from features_common import (  # noqa: E402  (se reexportan para los que ya los importan de aqui)
    FEATURE_DIM,
    HAND_POINTS,
    IDLE_SPEED,
    MARGIN_FRAMES,
    POSE_LEFT_SHOULDER,
    POSE_LEFT_WRIST,
    POSE_RIGHT_SHOULDER,
    POSE_RIGHT_WRIST,
    SEQ_LEN,
    TARGET_FPS,
    active_span as _active_span,
    normalise_hand as _normalise,
    resample as _resample,
)

# Los mismos modelos que carga la app (ver frontend .../mediapipeProvider.web.ts).
HAND_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)


def ensure_model(url: str, folder: str) -> str:
    """Descarga el .task la primera vez y devuelve su ruta local."""
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, url.rsplit("/", 1)[-1])
    if not os.path.exists(path):
        print(f"bajando {os.path.basename(path)}...")
        urllib.request.urlretrieve(url, path)
    return path


# ---------------------------------------------------------------- extraccion


@dataclass
class FrameLandmarks:
    """Manos ya asignadas a derecha/izquierda y hombros del mismo frame."""

    right: np.ndarray | None  # (21, 3)
    left: np.ndarray | None
    shoulder_centre: np.ndarray | None  # (2,)
    shoulder_scale: float


def _assign_hands(hands: list[np.ndarray], pose: np.ndarray | None) -> tuple[np.ndarray | None, np.ndarray | None]:
    """
    Reparte las manos detectadas segun a que muneca del torso estan mas cerca.

    No se usa la etiqueta de MediaPipe: su convencion supone imagen en espejo y
    estos videos no lo estan. Es la misma regla que usaron los autores de
    LSC-54, asi que los dos datasets quedan con el mismo criterio.
    """
    if pose is None:
        return (hands[0] if hands else None, hands[1] if len(hands) > 1 else None)

    right_wrist = pose[POSE_RIGHT_WRIST][:2]
    left_wrist = pose[POSE_LEFT_WRIST][:2]

    right: np.ndarray | None = None
    left: np.ndarray | None = None
    for hand in hands:
        wrist = hand[0][:2]
        to_right = float(np.linalg.norm(wrist - right_wrist))
        to_left = float(np.linalg.norm(wrist - left_wrist))
        if to_right <= to_left:
            if right is None:
                right = hand
        elif left is None:
            left = hand
    return right, left


def _to_array(landmarks) -> np.ndarray:
    return np.array([[p.x, p.y, p.z] for p in landmarks], dtype=np.float32)


def read_video_landmarks(path: str, hand_model: str, pose_model: str) -> list[FrameLandmarks]:
    """Corre MediaPipe sobre cada frame del video."""
    hand_opts = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=hand_model),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
    )
    pose_opts = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=pose_model),
        running_mode=vision.RunningMode.VIDEO,
    )

    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    out: list[FrameLandmarks] = []

    with vision.HandLandmarker.create_from_options(hand_opts) as hand_det, \
            vision.PoseLandmarker.create_from_options(pose_opts) as pose_det:
        index = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            timestamp = int(index * 1000 / fps)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

            pose_res = pose_det.detect_for_video(image, timestamp).pose_landmarks
            hand_res = hand_det.detect_for_video(image, timestamp).hand_landmarks

            pose = _to_array(pose_res[0]) if pose_res else None
            hands = [_to_array(h) for h in hand_res] if hand_res else []
            right, left = _assign_hands(hands, pose)

            centre: np.ndarray | None = None
            scale = 0.0
            if pose is not None:
                ls = pose[POSE_LEFT_SHOULDER][:2]
                rs = pose[POSE_RIGHT_SHOULDER][:2]
                centre = (ls + rs) / 2.0
                scale = float(np.linalg.norm(ls - rs))

            out.append(FrameLandmarks(right, left, centre, scale))
            index += 1

    cap.release()
    return out


def build_sequence(frames: list[FrameLandmarks]) -> tuple[np.ndarray, tuple[int, int]] | None:
    """
    Arma la secuencia final: normaliza, rellena huecos hacia adelante y
    remuestrea a SEQ_LEN. Devuelve None si el clip no sirve.
    """
    usable = [f for f in frames if f.shoulder_centre is not None and f.shoulder_scale > 0]
    if len(usable) < 2:
        return None

    rows: list[np.ndarray] = []
    present = [0, 0]
    last = {"right": None, "left": None}

    for f in usable:
        row = np.zeros(FEATURE_DIM, dtype=np.float32)
        for slot, (name, hand) in enumerate((("right", f.right), ("left", f.left))):
            # Relleno hacia adelante, igual que hizo LSC-54 con sus huecos.
            if hand is None:
                hand = last[name]
            else:
                last[name] = hand
                present[slot] += 1
            row[slot * 63:(slot + 1) * 63] = _normalise(hand, f.shoulder_centre, f.shoulder_scale)
            row[126 + slot] = 1.0 if hand is not None else 0.0
        rows.append(row)

    stacked = np.stack(rows)
    start, end = _active_span(stacked)
    return _resample(stacked[start:end + 1]), (present[0], present[1])


# ---------------------------------------------------------------- LSC50


LSC50_NAME = re.compile(r"^(\d{4})_(\d{4})_(\d{4})\.avi$", re.IGNORECASE)


def parse_lsc50_name(filename: str) -> dict[str, str] | None:
    """`<sena>_<senante>_<repeticion>.avi` -> sus tres partes."""
    m = LSC50_NAME.match(os.path.basename(filename))
    if not m:
        return None
    return {"sign_id": m.group(1), "signer": m.group(2), "take": m.group(3)}


def extract_clip(path: str, hand_model: str, pose_model: str) -> dict | None:
    """Un clip -> el registro que se guarda en el .jsonl."""
    meta = parse_lsc50_name(path)
    frames = read_video_landmarks(path, hand_model, pose_model)
    built = build_sequence(frames)
    if built is None:
        return None
    sequence, present = built

    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()

    return {
        "dataset": "lsc50",
        "signer": meta["signer"] if meta else "?",
        # La glosa sale despues, con labels.json; aqui va el id del dataset.
        "sign_id": meta["sign_id"] if meta else "?",
        "take": meta["take"] if meta else "?",
        "source_clip": os.path.basename(path),
        "fps_original": round(float(fps), 2),
        "frames_read": len(frames),
        "hands_present": list(present),
        "frames": np.round(sequence, 5).tolist(),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Extrae landmarks de videos al formato del modelo")
    ap.add_argument("--videos", required=True, help="carpeta con los .avi")
    ap.add_argument("--out", required=True, help="archivo .jsonl de salida")
    ap.add_argument("--models", default="models", help="carpeta donde guardar los .task")
    ap.add_argument("--limit", type=int, default=0, help="procesar solo los primeros N")
    args = ap.parse_args()

    hand_model = ensure_model(HAND_MODEL_URL, args.models)
    pose_model = ensure_model(POSE_MODEL_URL, args.models)

    videos = sorted(f for f in os.listdir(args.videos) if f.lower().endswith(".avi"))
    if args.limit:
        videos = videos[: args.limit]

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    written = skipped = 0
    with open(args.out, "w", encoding="utf-8") as fh:
        for i, name in enumerate(videos, 1):
            record = extract_clip(os.path.join(args.videos, name), hand_model, pose_model)
            if record is None:
                skipped += 1
                print(f"[{i}/{len(videos)}] {name}: SIN HOMBROS, descartado")
                continue
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1
            print(
                f"[{i}/{len(videos)}] {name}: {record['frames_read']} frames leidos, "
                f"manos der/izq en {record['hands_present'][0]}/{record['hands_present'][1]}"
            )

    print(f"\n{written} clips escritos en {args.out} ({skipped} descartados)")


if __name__ == "__main__":
    main()
