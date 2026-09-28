"""
Modelo de reconocimiento de senas y su entrenamiento.

Entrada: secuencias de 30 frames x 128 valores (ver
docs/06-data/model-input-format.md). Salida: una glosa entre N.

La arquitectura es Conv1D + GRU a proposito:
  - Conv1D resume el movimiento local (como cambia la mano entre frames
    vecinos) y es barato.
  - GRU mira la secuencia completa y tiene la mitad de compuertas que una LSTM,
    asi que convierte a .tflite sin los problemas de las LSTM.

Se mantiene chico (unos 200 mil parametros) porque tiene que correr en el
navegador de un celular con el mismo retardo que en escritorio.

Uso:
    python train_model.py --dataset ../datasets/dataset.npz --epocas 60
    python train_model.py --dataset ... --solo-dataset lsc54   # modelo base
"""

from __future__ import annotations

import argparse
import json
import os

import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

SEQ_LEN = 30
FEATURE_DIM = 128


# ---------------------------------------------------------------- modelo


def build_model(n_clases: int, seq_len: int = SEQ_LEN, feature_dim: int = FEATURE_DIM) -> keras.Model:
    """Conv1D para el movimiento corto, GRU para la secuencia entera."""
    entrada = keras.Input(shape=(seq_len, feature_dim), name="landmarks")

    # Normalizacion por canal: las coordenadas ya vienen en anchos de hombro,
    # pero cada punto tiene su propio rango y esto acelera la convergencia.
    x = layers.BatchNormalization()(entrada)

    for filtros in (128, 128):
        x = layers.Conv1D(filtros, kernel_size=5, padding="same", activation="relu")(x)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling1D(pool_size=2)(x)
        x = layers.Dropout(0.3)(x)

    x = layers.Bidirectional(layers.GRU(96, return_sequences=False))(x)
    x = layers.Dropout(0.4)(x)
    x = layers.Dense(128, activation="relu")(x)
    x = layers.Dropout(0.3)(x)
    salida = layers.Dense(n_clases, activation="softmax", name="gloss")(x)

    modelo = keras.Model(entrada, salida, name="lsc_recognizer")
    modelo.compile(
        optimizer=keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return modelo


# ---------------------------------------------------------------- datos


def load_dataset(path: str, solo_dataset: str | None = None) -> dict:
    """
    Carga el .npz de build_dataset.py.

    `solo_dataset` filtra por fuente (lsc54 / lsc50) para el modelo base: los
    senantes vienen etiquetados como "fuente:persona".
    """
    d = np.load(path, allow_pickle=True)
    datos = {"glosses": [str(g) for g in d["glosses"]]}

    for conjunto in ("train", "val", "test"):
        X, y, s = d[f"X_{conjunto}"], d[f"y_{conjunto}"], d[f"signers_{conjunto}"]
        if solo_dataset:
            mask = np.array([str(v).startswith(f"{solo_dataset}:") for v in s])
            X, y, s = X[mask], y[mask], s[mask]
        datos[conjunto] = (X, y, s)

    return datos


def class_weights(y: np.ndarray, n_clases: int) -> dict[int, float]:
    """
    Compensa las clases con pocas muestras.

    Las senas no quedan parejas: unas tienen 50 grabaciones y otras 20. Sin
    esto el modelo aprende a acertar las abundantes e ignorar el resto.
    """
    cuenta = np.bincount(y, minlength=n_clases).astype(np.float64)
    cuenta[cuenta == 0] = 1.0
    pesos = cuenta.sum() / (len(cuenta) * cuenta)
    return {i: float(w) for i, w in enumerate(pesos)}


# ---------------------------------------------------------------- evaluacion


def confusion(y_true: np.ndarray, y_pred: np.ndarray, n: int) -> np.ndarray:
    m = np.zeros((n, n), dtype=np.int32)
    for real, pred in zip(y_true, y_pred):
        m[real, pred] += 1
    return m


def report(modelo: keras.Model, X: np.ndarray, y: np.ndarray, glosas: list[str], titulo: str) -> dict:
    """Exactitud global y por clase, con las confusiones principales."""
    if len(X) == 0:
        print(f"\n{titulo}: sin datos")
        return {}

    probas = modelo.predict(X, verbose=0)
    pred = probas.argmax(axis=1)
    acierto = float((pred == y).mean())
    print(f"\n{titulo}: exactitud {acierto:.1%} sobre {len(y)} secuencias")

    m = confusion(y, pred, len(glosas))
    filas = []
    for i, glosa in enumerate(glosas):
        total = int(m[i].sum())
        if total == 0:
            continue
        correctos = int(m[i, i])
        confundida = int(np.argmax(np.where(np.arange(len(glosas)) == i, -1, m[i])))
        filas.append((correctos / total, glosa, total, glosas[confundida] if m[i, confundida] else "-"))

    filas.sort()
    print("  peores clases:")
    for tasa, glosa, total, con in filas[:8]:
        print(f"    {glosa:<20} {tasa:>5.0%} de {total:<4} se confunde con {con}")

    return {"accuracy": acierto, "per_class": {f[1]: f[0] for f in filas}}


def entrenar(datos: dict, epocas: int, batch: int = 32, paciencia: int = 12) -> tuple[keras.Model, dict]:
    X_tr, y_tr, _ = datos["train"]
    X_val, y_val, _ = datos["val"]
    glosas = datos["glosses"]

    modelo = build_model(len(glosas))
    print(f"parametros: {modelo.count_params():,}")

    callbacks = [
        keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=paciencia, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=5, min_lr=1e-5),
    ]

    historia = modelo.fit(
        X_tr, y_tr,
        validation_data=(X_val, y_val) if len(X_val) else None,
        epochs=epocas,
        batch_size=batch,
        class_weight=class_weights(y_tr, len(glosas)),
        callbacks=callbacks,
        verbose=2,
    )
    return modelo, historia.history


def main() -> None:
    ap = argparse.ArgumentParser(description="Entrena el reconocedor de senas")
    ap.add_argument("--dataset", default="../datasets/dataset.npz")
    ap.add_argument("--epocas", type=int, default=60)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--solo-dataset", default=None, help="lsc54 o lsc50, para el modelo base")
    ap.add_argument("--salida", default="../modelos")
    args = ap.parse_args()

    datos = load_dataset(args.dataset, args.solo_dataset)
    glosas = datos["glosses"]
    for conjunto in ("train", "val", "test"):
        X, y, s = datos[conjunto]
        print(f"{conjunto}: {len(X)} secuencias, {len(set(s.tolist()))} senantes")

    if len(datos["train"][0]) == 0:
        raise SystemExit("No hay datos de entrenamiento")

    modelo, _ = entrenar(datos, args.epocas, args.batch)

    resultados = {
        "val": report(modelo, *datos["val"][:2], glosas, "Validacion"),
        "test": report(modelo, *datos["test"][:2], glosas, "Prueba"),
    }

    os.makedirs(args.salida, exist_ok=True)
    nombre = f"modelo_{args.solo_dataset or 'unificado'}"
    modelo.save(os.path.join(args.salida, f"{nombre}.keras"))
    with open(os.path.join(args.salida, f"{nombre}_glosas.json"), "w", encoding="utf-8") as fh:
        json.dump(glosas, fh, ensure_ascii=False, indent=2)
    with open(os.path.join(args.salida, f"{nombre}_metricas.json"), "w", encoding="utf-8") as fh:
        json.dump(resultados, fh, ensure_ascii=False, indent=2)

    print(f"\nguardado en {args.salida}/{nombre}.keras")


if __name__ == "__main__":
    main()
