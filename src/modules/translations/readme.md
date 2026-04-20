# módulo translations — Traducciones

Módulo pendiente de implementación. Procesa los tres modos de traducción: seña→texto, texto→seña y voz→seña.

## Estado

**No implementado.** La carpeta existe como placeholder.

## Rutas planificadas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/translations/translate` | Procesa una traducción (recibe imagen/texto/audio) |
| `GET` | `/api/translations/history` | Lista el historial (alias de `/api/history`) |
| `DELETE` | `/api/translations/:id` | Borra lógicamente una traducción |

## Archivos a crear

- `translations.routes.js`
- `translations.controller.js`
- `translations.service.js`
- `translations.repository.js`

## Frontend actual

`TranslationScreen.tsx` usa un `setTimeout` simulando latencia en lugar de llamar al backend. La cámara muestra `camera_placeholder.jpg`. Tiene `// TODO: Integrar cámara real y módulo IA` y `// TODO: Conectar con ENDPOINTS.translate`.
