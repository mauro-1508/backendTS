"""
Valida las rutas que los scripts reciben por linea de comandos o leen de archivos.

Solo se aceptan rutas dentro de las carpetas de trabajo conocidas; cualquier
otra (por ejemplo `../../../etc`) se rechaza antes de abrir o escribir nada.

Carpetas permitidas:
  - recognition-service/ (datasets, modelos y export del repositorio)
  - la carpeta desde donde se ejecuta el script
  - /content, en Colab
  - LSC_DATA_DIR, si se define, para datos que esten en otro disco

Las rutas se devuelven absolutas: asi tampoco pueden confundirse con una
opcion (`--algo`) cuando se pasan a otro programa.
"""

from __future__ import annotations

import os

_SERVICE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__))))


def _raices() -> list[str]:
    raices = [_SERVICE_ROOT, os.path.realpath(os.getcwd())]
    if os.path.isdir("/content"):
        raices.append("/content")
    extra = os.environ.get("LSC_DATA_DIR")
    if extra:
        raices.append(os.path.realpath(extra))
    return raices


def ruta_segura(ruta: str | None) -> str | None:
    """Ruta absoluta si cae dentro de una carpeta permitida; si no, termina el script."""
    if ruta is None:
        return None
    real = os.path.realpath(ruta)
    for raiz in _raices():
        if real == raiz or real.startswith(raiz.rstrip(os.sep) + os.sep):
            return real
    raise SystemExit(f"Ruta no permitida (fuera de las carpetas de trabajo): {ruta}")


def nombre_seguro(nombre: str) -> str:
    """Un nombre de archivo sin carpetas: `modelo_54` si, `../modelo` no."""
    if not nombre or os.path.basename(nombre) != nombre or nombre in (".", ".."):
        raise SystemExit(f"Nombre no permitido: {nombre}")
    return nombre
