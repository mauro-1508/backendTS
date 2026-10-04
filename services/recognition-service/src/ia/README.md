# Dominio `ia`

Todo lo relacionado con inteligencia artificial del backend. Mantiene la arquitectura
hexagonal de los demás dominios:

| Carpeta | Contenido |
|---|---|
| `domain/` | Entidades: `SignTemplate`, `Gesture` |
| `application/` | Casos de uso: importar plantillas, listar, borrar |
| `ports/` | Interfaces de entrada (servicio) y salida (repositorio) |
| `adapters/` | Postgres (salida) y HTTP (entrada) |
| `training/` | Conversión de datasets públicos a plantillas del motor (TypeScript) |

El reconocimiento corre en el cliente (MediaPipe + DTW/KNN en el frontend). El backend
guarda y reparte las plantillas; no infiere.
