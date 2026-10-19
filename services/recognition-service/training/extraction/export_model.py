"""
Pasa un modelo entrenado a los formatos que consumen la app web y la movil.

Por que hace falta este paso y no basta con el .keras: la GRU bidireccional,
tal como se entrena, se compila al kernel cuDNN de NVIDIA. El grafo resultante
trae CudnnRNNV3 y ReverseSequence, y el conversor de TensorFlow.js corta con
"Unsupported Ops in the model before optimization". TFLite tampoco lo toma sin
arrastrar operadores extra.

La salida es: reconstruir la misma arquitectura con la GRU desenrollada
(unroll=True), copiarle los pesos y exportar desde ahi. Son los mismos pesos,
asi que el modelo predice identico; solo cambia como queda escrito el grafo.

Los dos formatos salen del mismo SavedModel a proposito: el plan exige que web
y movil muestren lo mismo, y eso es mas facil de sostener si ambos vienen del
mismo origen en vez de dos conversiones independientes.

Uso:
    python export_model.py --modelo ../modelos/modelo_20.keras --salida ../export
    python export_model.py ... --sin-cuantizar   # si el .tflite se desvia
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess

import numpy as np
import tensorflow as tf
from tensorflow import keras

from train_model import build_model

# Cuanto puede desviarse una conversion antes de considerarla un problema.
# 1e-3 en la probabilidad no mueve ninguna decision (el umbral de la app es
# 0,75); la cuantizacion del .tflite si puede acercarse a ese limite.
TOLERANCIA = 1e-3


def rebuild_unrolled(modelo: keras.Model, n_clases: int) -> keras.Model:
    """Misma arquitectura con la GRU desenrollada y los pesos originales."""
    nuevo = build_model(n_clases, unroll=True)
    nuevo.set_weights(modelo.get_weights())
    return nuevo


def compare(a: np.ndarray, b: np.ndarray, titulo: str) -> bool:
    """Dos salidas son equivalentes si eligen la misma clase y casi el mismo puntaje."""
    misma = bool((a.argmax(axis=1) == b.argmax(axis=1)).all())
    dif = float(np.abs(a - b).max())
    estado = "ok" if misma and dif <= TOLERANCIA else "REVISAR"
    print(f"  {titulo:<24} misma clase: {str(misma):<5} dif max: {dif:.2e}  [{estado}]")
    return misma and dif <= TOLERANCIA


def export_tfjs(saved_model: str, destino: str) -> None:
    subprocess.run(
        [
            "tensorflowjs_converter",
            "--input_format=tf_saved_model",
            "--output_format=tfjs_graph_model",
            saved_model,
            destino,
        ],
        check=True,
    )


def export_tflite(saved_model: str, destino: str, cuantizar: bool) -> bytes:
    conv = tf.lite.TFLiteConverter.from_saved_model(saved_model)
    if cuantizar:
        conv.optimizations = [tf.lite.Optimize.DEFAULT]
    datos = conv.convert()
    with open(destino, "wb") as fh:
        fh.write(datos)
    return datos


def run_tflite(datos: bytes, X: np.ndarray) -> np.ndarray:
    interp = tf.lite.Interpreter(model_content=datos)
    interp.allocate_tensors()
    entrada = interp.get_input_details()[0]
    salida = interp.get_output_details()[0]
    filas = []
    for fila in X:
        interp.set_tensor(entrada["index"], fila[None].astype(np.float32))
        interp.invoke()
        filas.append(interp.get_tensor(salida["index"])[0])
    return np.array(filas)


def main() -> None:
    ap = argparse.ArgumentParser(description="Exporta el modelo a TensorFlow.js y TFLite")
    ap.add_argument("--modelo", default="../modelos/modelo_20.keras")
    ap.add_argument("--glosas", default=None, help="por defecto, <modelo>_glosas.json")
    ap.add_argument("--salida", default="../export")
    ap.add_argument("--dataset", default=None, help=".npz para comparar con datos reales")
    ap.add_argument("--sin-cuantizar", action="store_true", help="tflite mas pesado y mas fiel")
    args = ap.parse_args()

    glosas_path = args.glosas or args.modelo.replace(".keras", "_glosas.json")
    with open(glosas_path, encoding="utf-8") as fh:
        glosas = json.load(fh)

    original = keras.models.load_model(args.modelo)
    nuevo = rebuild_unrolled(original, len(glosas))

    # Se comparan con datos reales si hay dataset: el ruido gaussiano no
    # recorre los mismos caminos del modelo que unas manos de verdad.
    if args.dataset:
        d = np.load(args.dataset, allow_pickle=True)
        X = d["X_test"][:32].astype(np.float32)
    else:
        X = np.random.randn(16, 30, 128).astype(np.float32)

    base = original.predict(X, verbose=0)
    print(f"\n{len(glosas)} glosas, {len(X)} secuencias de prueba")
    ok = compare(base, nuevo.predict(X, verbose=0), "desenrollado")

    saved_model = os.path.join(args.salida, "saved_model")
    shutil.rmtree(args.salida, ignore_errors=True)
    os.makedirs(args.salida, exist_ok=True)
    nuevo.export(saved_model)

    export_tfjs(saved_model, os.path.join(args.salida, "tfjs"))
    with open(os.path.join(args.salida, "tfjs", "glosas.json"), "w", encoding="utf-8") as fh:
        json.dump(glosas, fh, ensure_ascii=False)

    tflite = export_tflite(
        saved_model, os.path.join(args.salida, "modelo.tflite"), not args.sin_cuantizar
    )
    ok &= compare(base, run_tflite(tflite, X), "tflite")
    print(f"  tflite: {len(tflite) // 1024} KB")

    print(f"\nexportado en {args.salida}")
    if not ok:
        raise SystemExit(
            "Alguna conversion se desvia del modelo entrenado. Si es el tflite, "
            "reintenta con --sin-cuantizar."
        )


if __name__ == "__main__":
    main()
