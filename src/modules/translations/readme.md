# módulo translations — Traducciones

Persiste las traducciones del usuario: tanto las generadas por el agente de
señas (seña → texto) como las del modo texto → seña.

## Estado

**Implementado** (rutas, controller, service, repository). Tabla creada con
`backend/sql/001_translations.sql`.

## Rutas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/translations` | Crea una traducción. Body: `{ inputText, outputText, type, confidence?, source?, user_id? }` |
| `GET` | `/api/translations/history?user_id=&limit=&offset=` | Historial paginado del usuario |
| `DELETE` | `/api/translations/:id` | Borrado lógico (requiere user_id por body o query) |

## Tipos válidos para `type`

- `texto_sena` — usuario escribe texto, app muestra seña
- `sena_texto` — cámara reconoce seña, devuelve texto
- `voz_sena`   — voz reconocida, app muestra seña

## TODO

Cuando el `AuthContext` del frontend deje de ser mock y envíe un JWT real,
agregar `authMiddleware` en `translations.routes.js` y leer
`req.user.user_id` en el controller (la función `resolveUserId` ya lo
soporta — solo hay que decorar las rutas). Hoy se acepta `user_id` por body
o query para que el flujo funcione end-to-end sin login real.

## Archivos

- `backend/src/routes/translations.routes.js`
- `backend/src/controllers/translations.controller.js`
- `backend/src/services/translations.service.js`
- `backend/src/repositories/translations.repository.js`
- `backend/sql/001_translations.sql`
