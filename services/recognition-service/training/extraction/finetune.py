"""
Reajusta el modelo con las repeticiones grabadas desde la app.

Por que hace falta. El modelo aprendio de 25 personas grabadas en un estudio,
con una camara, una distancia y una luz concretas. Medido: señas que aciertan
el 100% contra señantes nuevos del dataset no salen nunca frente a otra
camara. No es que la seña este mal hecha ni que falten palabras; es que la
entrada se parece poco a la que vio. Eso se llama cambio de dominio y se
corrige con datos de la camara que se va a usar, no con mas datos de estudio.

Como se corrige sin romper lo aprendido:

  - Se parte del modelo ya entrenado, no de cero.
  - Se entrena con el dataset original MAS las muestras propias, y estas se
    repiten (`--peso`) para que pesen pese a ser pocas. Entrenar solo con las
    propias haria que el modelo olvide todo lo demas, que es un problema
    conocido y tiene nombre: olvido catastrofico.
  - Con un paso de aprendizaje diez veces menor que el del entrenamiento
    original, para mover los pesos sin deshacerlos.
  - Las primeras capas se congelan: las convoluciones ya saben leer movimiento
    de manos y eso no cambia por usar otra camara. Lo que hay que reajustar es
    la parte que decide.

Entrada: los dos archivos que descarga la pantalla "Mis repeticiones":

    mis_muestras.json   forma, lista de glosas y fecha
    mis_muestras.bin    los numeros en crudo (N x 30 x 128, float32)

Uso en Colab:

    !python finetune.py --muestras /content/mis_muestras

donde /content/mis_muestras.json y .bin son los archivos subidos.
"""

from __future__ import annotations

import argparse
import json
import os

import numpy as np
from tensorflow import keras

from train_and_export import exportar, find_dataset
from train_model import SEQ_LEN, FEATURE_DIM, class_weights, report


def cargar_mias(prefijo: str, glosas: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Lee el par .json/.bin y traduce sus glosas a los indices del modelo."""
    with open(f"{prefijo}.json", encoding="utf-8") as fh:
        indice = json.load(fh)

    n, seq, dim = indice["forma"]
    if (seq, dim) != (SEQ_LEN, FEATURE_DIM):
        raise SystemExit(
            f"Las muestras son {seq}x{dim} y el modelo espera {SEQ_LEN}x{FEATURE_DIM}. "
            "Se grabaron con otra version de la app."
        )

    X = np.fromfile(f"{prefijo}.bin", dtype=np.float32)
    if X.size != n * seq * dim:
        raise SystemExit(f"El .bin tiene {X.size} valores y el .json declara {n * seq * dim}.")
    X = X.reshape(n, seq, dim)

    # Una glosa que no este en el modelo no se puede usar: no hay salida para
    # ella. Se avisa en vez de descartarla en silencio.
    posicion = {g: i for i, g in enumerate(glosas)}
    desconocidas = sorted({g for g in indice["glosas"] if g not in posicion})
    if desconocidas:
        print(f"AVISO: glosas que el modelo no conoce, se omiten: {', '.join(desconocidas)}")

    usables = [i for i, g in enumerate(indice["glosas"]) if g in posicion]
    y = np.array([posicion[indice["glosas"][i]] for i in usables], dtype=np.int64)
    return X[usables], y


def congelar_convoluciones(modelo: keras.Model) -> int:
    """
    Deja fijas las capas que leen movimiento y libera las que deciden.

    Las convoluciones aprendieron a detectar como se mueve una mano entre
    frames vecinos, y eso no cambia porque la camara sea otra. Lo que si
    cambia es el aspecto global de la entrada, que es lo que interpretan la
    GRU y las capas densas.
    """
    congeladas = 0
    for capa in modelo.layers:
        if isinstance(capa, (keras.layers.Conv1D,)):
            capa.trainable = False
            congeladas += 1
    return congeladas


def main() -> None:
    ap = argparse.ArgumentParser(description="Reajusta el modelo con muestras propias")
    ap.add_argument("--muestras", default="/content/mis_muestras", help="prefijo de los .json/.bin")
    ap.add_argument("--dataset", default="/content/drive/MyDrive/traduce_senas/datasets/dataset.npz")
    ap.add_argument("--modelos", default="/content/drive/MyDrive/traduce_senas/modelos")
    ap.add_argument("--base", default="modelo_54", help="modelo del que se parte")
    ap.add_argument("--nombre", default="modelo_54_mio", help="como se guarda el reajustado")
    ap.add_argument("--epocas", type=int, default=25)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-4, help="diez veces menor que el entrenamiento")
    ap.add_argument(
        "--peso",
        type=int,
        default=8,
        help="cuantas veces se repiten las muestras propias frente al dataset",
    )
    ap.add_argument("--salida", default="/content/tfjs")
    ap.add_argument("--zip", default="/content/modelo_lsc")
    args = ap.parse_args()

    # ------------------------------------------------------------ datos
    dataset = find_dataset(args.dataset)
    d = np.load(dataset, allow_pickle=True)
    glosas = [str(g) for g in d["glosses"]]

    X_mias, y_mias = cargar_mias(args.muestras, glosas)
    if len(X_mias) == 0:
        raise SystemExit("No hay ninguna muestra usable.")

    cuenta = np.bincount(y_mias, minlength=len(glosas))
    cubiertas = [(glosas[i], int(c)) for i, c in enumerate(cuenta) if c]
    print(f"muestras propias: {len(X_mias)} en {len(cubiertas)} señas")
    print("  " + ", ".join(f"{g} {c}" for g, c in sorted(cubiertas, key=lambda x: -x[1])[:12]))

    # Se reservan algunas propias para medir: sin esto no hay forma de saber si
    # el reajuste sirvio o solo se las aprendio de memoria.
    orden = np.random.default_rng(0).permutation(len(X_mias))
    corte = max(1, len(orden) // 5)
    prueba, entreno = orden[:corte], orden[corte:]
    X_prueba, y_prueba = X_mias[prueba], y_mias[prueba]
    X_mias, y_mias = X_mias[entreno], y_mias[entreno]

    X_tr = np.concatenate([d["X_train"]] + [X_mias] * args.peso)
    y_tr = np.concatenate([d["y_train"]] + [y_mias] * args.peso)
    print(f"entrenamiento: {len(d['X_train'])} del dataset + {len(X_mias)}x{args.peso} propias")

    # ------------------------------------------------------------ modelo
    ruta_base = os.path.join(args.modelos, f"{args.base}.keras")
    if not os.path.exists(ruta_base):
        raise SystemExit(f"No existe {ruta_base}: hay que entrenar primero con train_and_export.py")
    modelo = keras.models.load_model(ruta_base)

    print("\nANTES del reajuste:")
    report(modelo, X_prueba, y_prueba, glosas, "  Mis señas reservadas")
    report(modelo, d["X_test"], d["y_test"], glosas, "  Dataset")

    congeladas = congelar_convoluciones(modelo)
    modelo.compile(
        optimizer=keras.optimizers.Adam(args.lr),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    print(f"\n{congeladas} capas convolucionales congeladas; paso de aprendizaje {args.lr}")

    modelo.fit(
        X_tr, y_tr,
        validation_data=(d["X_val"], d["y_val"]),
        epochs=args.epocas,
        batch_size=args.batch,
        class_weight=class_weights(y_tr, len(glosas)),
        callbacks=[
            keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=8, restore_best_weights=True),
            keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=4, min_lr=1e-6),
        ],
        verbose=2,
    )

    # ------------------------------------------------------------ veredicto
    print("\nDESPUES del reajuste:")
    mias = report(modelo, X_prueba, y_prueba, glosas, "  Mis señas reservadas")
    base = report(modelo, d["X_test"], d["y_test"], glosas, "  Dataset")

    os.makedirs(args.modelos, exist_ok=True)
    modelo.save(os.path.join(args.modelos, f"{args.nombre}.keras"))
    with open(os.path.join(args.modelos, f"{args.nombre}_metricas.json"), "w", encoding="utf-8") as fh:
        json.dump({"mias": mias, "dataset": base}, fh, ensure_ascii=False, indent=2)

    # Un reajuste que mejora lo propio hundiendo el dataset esta sobreajustado
    # a unas pocas grabaciones: se avisa en vez de exportarlo como si tal cosa.
    if base.get("accuracy", 0) < 0.6:
        print(
            "\nAVISO: la exactitud en el dataset bajo mucho. El modelo se esta "
            "ajustando demasiado a tus grabaciones. Prueba con --peso mas bajo "
            "o grabando mas repeticiones."
        )

    exportar(modelo, glosas, X_prueba, X_tr, args)


if __name__ == "__main__":
    main()
