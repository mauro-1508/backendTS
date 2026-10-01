"""
Entrena un modelo con TODAS las glosas del dataset y lo deja listo para la app.

Hace de corrido lo que antes eran siete celdas de Colab: entrenar, desenrollar
la GRU, exportar a TensorFlow.js, escribir glosas.json y empaquetar el zip. Va
en un solo archivo para no tener que pegar codigo en Colab, que es donde se
cortan las lineas largas y aparecen SyntaxError que no son del codigo.

Uso en Colab:

    !pip install -q tensorflowjs
    !git clone -q -b feat/backend-dominios-ia https://github.com/mauro-1508/backendTS.git /content/repo
    !python /content/repo/src/domains/ia/training/extraction/train_and_export.py

    from google.colab import files
    files.download('/content/modelo_lsc.zip')

El zip se descomprime en frontend/public/models/lsc/ y la app toma el
vocabulario nuevo sola: la lista de palabras sale de glosas.json.

Uso local (requiere TensorFlow):

    python train_and_export.py --dataset ../datasets/dataset.npz --salida ../export
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess

import numpy as np
from tensorflow import keras

from train_model import build_model, class_weights, report

# El tensorflowjs publicado no se ha actualizado al Python 3.13 / NumPy 2 de
# Colab. Son dos incompatibilidades conocidas y cada una se arregla con una
# linea; sin esto el conversor ni siquiera importa.
def patch_tensorflowjs() -> None:
    try:
        import tensorflowjs
    except ImportError:
        return

    for ruta in pathlib.Path(tensorflowjs.__path__[0]).rglob("*.py"):
        texto = ruta.read_text(encoding="utf-8")
        if "np.object" in texto:  # retirado en NumPy 2
            ruta.write_text(
                texto.replace("np.object,", "object,").replace("np.object)", "object)"),
                encoding="utf-8",
            )
            print(f"  parchado {ruta.name}")

    try:
        import tensorflow_hub
    except ImportError:
        return
    ruta = pathlib.Path(tensorflow_hub.__path__[0]) / "estimator_export.py"
    # tf.compat.v1.estimator ya no existe en TF 2.20
    if ruta.exists() and "tf.compat.v1.estimator" in ruta.read_text(encoding="utf-8"):
        ruta.write_text("def estimator_export(*a, **k):\n    return lambda f: f\n", encoding="utf-8")
        print(f"  parchado {ruta.name}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Entrena con todas las glosas y exporta para la app")
    ap.add_argument("--dataset", default="/content/drive/MyDrive/traduce_senas/datasets/dataset.npz")
    ap.add_argument("--modelos", default="/content/drive/MyDrive/traduce_senas/modelos")
    ap.add_argument("--salida", default="/content/tfjs")
    ap.add_argument("--zip", default="/content/modelo_lsc")
    ap.add_argument("--epocas", type=int, default=60)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--nombre", default="modelo_54")
    args = ap.parse_args()

    # ------------------------------------------------------------ datos
    d = np.load(args.dataset, allow_pickle=True)
    glosas = [str(g) for g in d["glosses"]]
    X_tr, y_tr = d["X_train"], d["y_train"]
    X_va, y_va = d["X_val"], d["y_val"]
    X_te, y_te = d["X_test"], d["y_test"]
    print(f"{len(glosas)} glosas | {len(X_tr)} train | {len(X_va)} val | {len(X_te)} test")

    # ------------------------------------------------------------ entrenamiento
    modelo = build_model(len(glosas))
    print(f"parametros: {modelo.count_params():,}")
    modelo.fit(
        X_tr, y_tr,
        validation_data=(X_va, y_va) if len(X_va) else None,
        epochs=args.epocas,
        batch_size=args.batch,
        class_weight=class_weights(y_tr, len(glosas)),
        callbacks=[
            keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=12, restore_best_weights=True),
            keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=5, min_lr=1e-5),
        ],
        verbose=2,
    )

    # Se guarda antes de exportar: si la conversion falla, el entrenamiento no
    # se repite. Ya se perdio un modelo una vez por no hacer esto.
    os.makedirs(args.modelos, exist_ok=True)
    modelo.save(os.path.join(args.modelos, f"{args.nombre}.keras"))
    with open(os.path.join(args.modelos, f"{args.nombre}_glosas.json"), "w", encoding="utf-8") as fh:
        json.dump(glosas, fh, ensure_ascii=False, indent=2)
    print(f"\nguardado: {args.modelos}/{args.nombre}.keras")

    metricas = {
        "val": report(modelo, X_va, y_va, glosas, "Validacion"),
        "test": report(modelo, X_te, y_te, glosas, "Prueba"),
    }
    with open(os.path.join(args.modelos, f"{args.nombre}_metricas.json"), "w", encoding="utf-8") as fh:
        json.dump(metricas, fh, ensure_ascii=False, indent=2)

    # ------------------------------------------------------------ exportacion
    # La GRU entrenada en GPU se compila al kernel cuDNN, y el grafo resultante
    # trae CudnnRNNV3 y ReverseSequence, que el conversor de TensorFlow.js
    # rechaza. Desenrollarla lo evita sin tocar los pesos.
    print("\ndesenrollando la GRU para poder exportar...")
    plano = build_model(len(glosas), unroll=True)
    plano.set_weights(modelo.get_weights())

    muestra = X_te[:100].astype(np.float32) if len(X_te) else X_tr[:100].astype(np.float32)
    antes, despues = modelo.predict(muestra, verbose=0), plano.predict(muestra, verbose=0)
    igual = bool((antes.argmax(axis=1) == despues.argmax(axis=1)).all())
    dif = float(np.abs(antes - despues).max())
    print(f"  misma clase: {igual} | diferencia maxima: {dif:.2e}")
    if not (igual and dif < 1e-4):
        raise SystemExit("El modelo desenrollado no coincide con el entrenado: no se exporta.")

    patch_tensorflowjs()

    # El conversor no sabe leer un SavedModel montado en Drive, asi que se
    # escribe en disco local y despues se copia el resultado.
    saved_model = "/content/saved_model" if os.path.isdir("/content") else "./saved_model"
    for carpeta in (saved_model, args.salida):
        shutil.rmtree(carpeta, ignore_errors=True)
    plano.export(saved_model)

    subprocess.run(
        [
            "tensorflowjs_converter",
            "--input_format=tf_saved_model",
            "--output_format=tfjs_graph_model",
            saved_model,
            args.salida,
        ],
        check=True,
    )

    with open(os.path.join(args.salida, "glosas.json"), "w", encoding="utf-8") as fh:
        json.dump(glosas, fh, ensure_ascii=False, indent=2)

    shutil.make_archive(args.zip, "zip", args.salida)

    print(f"\n{args.salida}:")
    for archivo in sorted(os.listdir(args.salida)):
        ruta = os.path.join(args.salida, archivo)
        print(f"  {os.path.getsize(ruta) / 1024:8.0f} KB  {archivo}")
    print(f"\nzip listo: {args.zip}.zip")
    print("Descomprimelo en frontend/public/models/lsc/ (reemplazando lo que haya).")


if __name__ == "__main__":
    main()
