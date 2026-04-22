# módulo users — Usuarios

Módulo pendiente de implementación. Gestión interna de usuarios (distinto de auth y profile).

## Estado

**No implementado.** La carpeta existe como placeholder. La tabla `users` en PostgreSQL sí existe y es usada por el módulo `auth`.

## Propósito planificado

Administración de usuarios: listado, activación/desactivación de cuentas, gestión de roles si se agregan en el futuro.

## Archivos a crear

- `users.routes.js`
- `users.controller.js`
- `users.service.js`
- `users.repository.js`

## Tabla en BD

La tabla `users` tiene las columnas: `id`, `name`, `email`, `password`, `created_at`, `updated_at`.

> Nota: el módulo `auth` accede directamente a esta tabla a través de `auth.repository.js`.
