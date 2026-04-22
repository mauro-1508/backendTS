# módulo profile — Perfil de Usuario

Módulo pendiente de implementación. Permite al usuario ver y actualizar su información personal y preferencias.

## Estado

**No implementado.** La carpeta existe como placeholder.

## Rutas planificadas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/profile` | Obtiene el perfil del usuario autenticado |
| `PUT` | `/api/profile` | Actualiza nombre, tema, idioma |
| `PUT` | `/api/profile/password` | Cambia la contraseña |
| `DELETE` | `/api/profile` | Elimina la cuenta (soft delete) |

## Archivos a crear

- `profile.routes.js`
- `profile.controller.js`
- `profile.service.js`
- `profile.repository.js`

## Frontend actual

`ProfileScreen.tsx` muestra datos hardcodeados. Tiene `// TODO: Conectar updateProfile y cambio de contraseña real`. El botón "Eliminar cuenta" abre un `Alert` mock sin llamar al backend.
