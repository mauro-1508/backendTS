# controllers — Controladores

Reciben el request HTTP, extraen los parámetros y delegan la lógica al service correspondiente.

## Archivos implementados

| Archivo | Rutas que maneja |
|---------|-----------------|
| `auth.controller.js` | `POST /api/auth/register`, `POST /api/auth/login` |

## Archivos pendientes

`history.controller.js`, `lexicon.controller.js`, `notifications.controller.js`, `profile.controller.js`, `stats.controller.js`, `translations.controller.js`, `users.controller.js`

## Convención

Cada método del controller debe:
1. Extraer datos de `req.body` / `req.params` / `req.query`
2. Llamar al service con los datos
3. Responder con `res.status(XXX).json(resultado)`
4. Capturar errores en `try/catch` y responder con `400` o `500`
