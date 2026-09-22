# Entrenamiento (conversión de datasets)

Scripts en TypeScript que convierten datasets públicos de landmarks al formato de
plantillas que lee el motor del frontend (`motionTemplateStore.ts`).

| Carpeta | Qué va | ¿Se versiona? |
|---|---|---|
| `datasets/` | Datos crudos descargados (p. ej. `datasets/lsc54/`) | **No** (`.gitignore`) |
| `converters/` | Conversores dataset → plantillas | Sí |
| `output/` | JSON convertido, listo para importar | **No** (`.gitignore`) |

El formato real de cada dataset se documenta aquí antes de escribir su conversor.
