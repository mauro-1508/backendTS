# módulo alarms — Alarmas

Módulo pendiente de implementación. Gestiona alarmas visuales de práctica para usuarios sordos.

## Estado

**No implementado.** La carpeta existe como placeholder.

## Rutas planificadas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/alarms` | Lista todas las alarmas del usuario autenticado |
| `POST` | `/api/alarms` | Crea una alarma nueva |
| `PUT` | `/api/alarms/:id` | Actualiza hora o estado de una alarma |
| `DELETE` | `/api/alarms/:id` | Elimina una alarma |

## Archivos a crear

- `alarms.routes.js` → rutas protegidas con middleware JWT
- `alarms.controller.js` → manejo de request/response
- `alarms.service.js` → lógica de negocio y validaciones
- `alarms.repository.js` → queries SQL a la tabla `alarms`

## Frontend actual

El frontend (`AlarmsScreen.tsx`) usa datos mock (`MOCK_ALARMS`) con un `// TODO: Conectar con endpoints de alarmas`.
