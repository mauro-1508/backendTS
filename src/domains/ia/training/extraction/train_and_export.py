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
import importlib.util
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

import numpy as np
from tensorflow import keras

from train_model import build_model, class_weights, report

def package_dir(nombre: str) -> pathlib.Path | None:
    """
    Carpeta de un paquete SIN importarlo.

    Importarlo seria lo natural, pero aqui no se puede: el paquete que hay que
    parchear es justo el que no se deja importar. `import tensorflowjs` falla
    en su propio __init__ con AttributeError: np.object. find_spec localiza el
    paquete sin ejecutar nada suyo.
    """
    try:
        spec = importlib.util.find_spec(nombre)
    except (ImportError, ValueError):
        return None
    if spec is None or not spec.submodule_search_locations:
        return None
    return pathlib.Path(list(spec.submodule_search_locations)[0])


# Alias que NumPy 2 retiro y que tensorflowjs todavia usa. Van todos juntos
# porque estan en la misma linea de read_weights.py:
#
#     np.uint8, np.uint16, np.object, np.bool]
#
# Arreglar solo np.object deja np.bool esperando dos lineas mas abajo.
ALIAS_NUMPY = {
    "np.object": "object",
    "np.bool": "bool",
    "np.int": "int",
    "np.float": "float",
    "np.str": "str",
    "np.complex": "complex",
}


# El tensorflowjs publicado no se ha actualizado al Python 3.13 / NumPy 2 de
# Colab; sin esto el conversor ni siquiera importa.
def patch_tensorflowjs() -> None:
    raiz = package_dir("tensorflowjs")
    if raiz is None:
        print("  tensorflowjs no esta instalado")
        return
    print(f"  parcheando {raiz}")

    # \\b al final evita tocar np.object_ o np.int64, que si existen.
    patron = re.compile(r"\b(" + "|".join(a.replace(".", r"\.") for a in ALIAS_NUMPY) + r")\b(?!_)")
    tocados = 0
    for ruta in raiz.rglob("*.py"):
        texto = ruta.read_text(encoding="utf-8")
        nuevo = patron.sub(lambda m: ALIAS_NUMPY[m.group(1)], texto)
        if nuevo != texto:
            ruta.write_text(nuevo, encoding="utf-8")
            print(f"    {ruta.relative_to(raiz)}")
            tocados += 1
    print(f"  {tocados} archivos parchados")

    hub = package_dir("tensorflow_hub")
    if hub is not None:
        ruta = hub / "estimator_export.py"
        # tf.compat.v1.estimator ya no existe en TF 2.20
        if ruta.exists() and "tf.compat.v1.estimator" in ruta.read_text(encoding="utf-8"):
            ruta.write_text("def estimator_export(*a, **k):\n    return lambda f: f\n", encoding="utf-8")
            print("  parchado tensorflow_hub/estimator_export.py")

    # Se comprueba en un proceso aparte, que es como lo va a importar el
    # conversor. Si falla aqui, falla alla, y es mejor saberlo antes de
    # exportar el SavedModel.
    prueba = subprocess.run(
        [sys.executable, "-c", "import tensorflowjs; print('import ok')"],
        capture_output=True,
        text=True,
    )
    if prueba.returncode != 0:
        print(prueba.stderr.strip()[-1500:])
        raise SystemExit(
            "tensorflowjs sigue sin importarse despues de parchear. "
            "El modelo entrenado esta guardado: se puede reintentar solo la "
            "exportacion con --solo-exportar."
        )
    print("  tensorflowjs importa correctamente")


def find_dataset(preferida: str) -> str:
    """
    Localiza el dataset.npz, y si no esta explica por que en vez de reventar.

    Drive se monta en /content/drive o en /content/gdrive segun como se haya
    hecho, y el montaje puede quedarse a medias sin avisar: la celda termina,
    no monta nada, y el primer sintoma aparece aqui como un FileNotFoundError
    que no dice nada util. Ya costo una tarde.
    """
    candidatos = [preferida]
    for punto in ("/content/drive", "/content/gdrive"):
        candidatos.append(f"{punto}/MyDrive/traduce_senas/datasets/dataset.npz")
    for ruta in candidatos:
        if os.path.exists(ruta):
            return ruta

    montado = [p for p in ("/content/drive", "/content/gdrive") if os.path.isdir(f"{p}/MyDrive")]
    aviso = ["", "No se encontro dataset.npz.", ""]
    if montado:
        aviso += [
            f"Drive esta montado en {montado[0]}, pero ahi no hay",
            "MyDrive/traduce_senas/datasets/dataset.npz.",
            "Revisa que sea la cuenta de Google correcta.",
        ]
    else:
        aviso += [
            "Drive NO esta montado. Corre en una celda aparte:",
            "",
            "    from google.colab import drive",
            "    drive.mount('/content/drive', force_remount=True)",
            "",
            "Esa celda pide permiso: hay que abrir el enlace, elegir la",
            "cuenta y aceptar. Si se deja a medias, termina sin montar y",
            "no avisa, y el fallo aparece mucho despues y en otro sitio.",
        ]
    raise SystemExit("\n".join(aviso))


def exportar(modelo, glosas: list[str], X_te, X_tr, args) -> None:
    """Deja el modelo listo para la app: TensorFlow.js, glosas y zip."""
    # La GRU entrenada en GPU se compila al kernel cuDNN, y el grafo resultante
    # trae CudnnRNNV3 y ReverseSequence, que el conversor de TensorFlow.js
    # rechaza. Desenrollarla lo evita sin tocar los pesos.
    print("\ndesenrollando la GRU para poder exportar...")
    plano = build_model(len(glosas), unroll=True)
    plano.set_weights(modelo.get_weights())

    muestra = (X_te[:100] if len(X_te) else X_tr[:100]).astype(np.float32)
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


def main() -> None:
    ap = argparse.ArgumentParser(description="Entrena con todas las glosas y exporta para la app")
    ap.add_argument("--dataset", default="/content/drive/MyDrive/traduce_senas/datasets/dataset.npz")
    ap.add_argument("--modelos", default="/content/drive/MyDrive/traduce_senas/modelos")
    ap.add_argument("--salida", default="/content/tfjs")
    ap.add_argument("--zip", default="/content/modelo_lsc")
    ap.add_argument("--epocas", type=int, default=60)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--nombre", default="modelo_54")
    ap.add_argument(
        "--solo-exportar",
        action="store_true",
        help="carga el .keras ya entrenado y solo exporta, sin volver a entrenar",
    )
    args = ap.parse_args()

    # ------------------------------------------------------------ datos
    dataset = find_dataset(args.dataset)
    if dataset != args.dataset:
        print(f"dataset encontrado en {dataset}")
    # Los modelos van junto al dataset, no donde diga el valor por defecto.
    if args.modelos.startswith("/content/drive") and not dataset.startswith("/content/drive"):
        args.modelos = os.path.join(os.path.dirname(os.path.dirname(dataset)), "modelos")
    d = np.load(dataset, allow_pickle=True)
    glosas = [str(g) for g in d["glosses"]]
    X_tr, y_tr = d["X_train"], d["y_train"]
    X_va, y_va = d["X_val"], d["y_val"]
    X_te, y_te = d["X_test"], d["y_test"]
    print(f"{len(glosas)} glosas | {len(X_tr)} train | {len(X_va)} val | {len(X_te)} test")

    # ------------------------------------------------------------ entrenamiento
    ruta_keras = os.path.join(args.modelos, f"{args.nombre}.keras")

    # Entrenar cuesta minutos y exportar ha fallado varias veces por culpa del
    # conversor. Poder reintentar solo la exportacion evita repetir lo caro.
    if args.solo_exportar:
        if not os.path.exists(ruta_keras):
            raise SystemExit(f"No existe {ruta_keras}: hay que entrenar primero.")
        print(f"cargando {ruta_keras} (sin entrenar)")
        modelo = keras.models.load_model(ruta_keras)
        exportar(modelo, glosas, X_te, X_tr, args)
        return

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

    exportar(modelo, glosas, X_te, X_tr, args)


if __name__ == "__main__":
    main()
