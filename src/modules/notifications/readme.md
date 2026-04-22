# módulo notifications — Notificaciones Push

Módulo pendiente de implementación. Maneja el envío de notificaciones push a dispositivos Android e iOS.

## Estado

**No implementado.** La carpeta existe como placeholder.

## Rutas planificadas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/notifications/register-token` | Registra el token push del dispositivo |
| `GET` | `/api/notifications` | Lista notificaciones del usuario |
| `PATCH` | `/api/notifications/:id/read` | Marca una notificación como leída |

## Archivos a crear

- `notifications.routes.js`
- `notifications.controller.js`
- `notifications.service.js`
- `notifications.repository.js`

## Frontend actual

`expo-notifications` está instalado en el frontend pero no integrado en ninguna pantalla.
