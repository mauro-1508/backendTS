"""
Piezas compartidas por los extractores: constantes del formato y las
operaciones de normalizacion y recorte.

Va aparte a proposito: LSC-54 ya trae los landmarks y no necesita MediaPipe ni
OpenCV para convertirse. Cuando esto vivia dentro de extract_landmarks.py,
convertir LSC-54 obligaba a instalar MediaPipe sin usarlo.

Contrato completo en docs/06-data/model-input-format.md.
"""

from __future__ import annotations

import numpy as np

SEQ_LEN = 30
"""Frames por clip, ya remuestreados."""

TARGET_FPS = 15
"""La app alimenta el modelo a este ritmo; el entrenamiento debe igualarlo."""

HAND_POINTS = 21
FEATURE_DIM = 2 * HAND_POINTS * 3 + 2  # 126 coordenadas + 2 banderas

# Indices de MediaPipe Pose que se usan como marco de referencia.
POSE_LEFT_SHOULDER = 11
POSE_RIGHT_SHOULDER = 12
POSE_LEFT_WRIST = 15
POSE_RIGHT_WRIST = 16

IDLE_SPEED = 0.02
"""Velocidad de muneca, en anchos de hombro por frame, bajo la cual se
considera que la persona todavia no empezo la sena (o ya termino)."""

MARGIN_FRAMES = 2


def normalise_hand(hand: np.ndarray | None, centre: np.ndarray, scale: float) -> np.ndarray:
    """Lleva una mano al marco de los hombros. Ausente = ceros."""
    if hand is None:
        return np.zeros(HAND_POINTS * 3, dtype=np.float32)
    out = np.empty((HAND_POINTS, 3), dtype=np.float32)
    out[:, 0] = (hand[:, 0] - centre[0]) / scale
    out[:, 1] = (hand[:, 1] - centre[1]) / scale
    out[:, 2] = hand[:, 2] / scale  # z ya es relativo a la muneca: solo escala
    return out.reshape(-1)


def resample(frames: np.ndarray, n: int = SEQ_LEN) -> np.ndarray:
    """
    Remuestreo temporal a n frames: interpolacion lineal en las coordenadas y
    vecino mas cercano en las banderas de presencia, que son 0 o 1 y no admiten
    valores intermedios.
    """
    if len(frames) == n:
        return frames
    src = np.linspace(0.0, 1.0, num=len(frames))
    dst = np.linspace(0.0, 1.0, num=n)

    out = np.stack([np.interp(dst, src, frames[:, c]) for c in range(frames.shape[1])], axis=1)
    nearest = np.clip(np.round(dst * (len(frames) - 1)).astype(int), 0, len(frames) - 1)
    out[:, 126:] = frames[nearest, 126:]
    return out.astype(np.float32)


def active_span(rows: np.ndarray) -> tuple[int, int]:
    """
    Primer y ultimo frame con movimiento real de manos.

    Los clips traen varios segundos de persona quieta antes y despues de la
    sena. Entrenar con eso ensena al modelo un tiempo muerto que la app nunca
    le va a dar: en vivo solo ve una ventana de 2 s mientras la persona se
    mueve. Medido en LSC50: los clips duran de 2,1 a 5,6 s.
    """
    wrists = np.stack([rows[:, 0:2], rows[:, 63:65]], axis=1)  # (frames, mano, xy)
    speed = np.linalg.norm(np.diff(wrists, axis=0), axis=2).max(axis=1)
    moving = np.flatnonzero(speed > IDLE_SPEED)
    if len(moving) < 4:
        return 0, len(rows) - 1
    return max(0, int(moving[0]) - MARGIN_FRAMES), min(len(rows) - 1, int(moving[-1]) + 1 + MARGIN_FRAMES)
