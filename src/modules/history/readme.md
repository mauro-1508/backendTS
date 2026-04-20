# módulo history — Historial de Traducciones

Módulo pendiente de implementación. Expone el historial de traducciones realizadas por el usuario autenticado.

## Estado

**No implementado.** La carpeta existe como placeholder.

## Rutas planificadas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/history` | Lista el historial de traducciones del usuario |
| `DELETE` | `/api/history/:id` | Borrado lógico de una traducción (soft delete) |

## Archivos a crear

- `history.routes.js`
- `history.controller.js`
- `history.service.js`
- `history.repository.js`

## Frontend actual

`HistoryScreen.tsx` usa `MOCK_HISTORY` (10 entradas hardcodeadas) con `// TODO: Conectar con ENDPOINTS.history y deleteTranslation`.
