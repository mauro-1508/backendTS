# módulo auth — Autenticación

Único módulo del backend implementado. Maneja el registro e inicio de sesión de usuarios con bcrypt y JWT.

## Estado

**Implementado:** registro, login  
**Pendiente:** logout, recuperación de contraseña, verificación de código OTP, reset de contraseña

## Rutas

| Método | Ruta | Descripción | Auth requerida |
|--------|------|-------------|---------------|
| `POST` | `/api/auth/register` | Registra un usuario nuevo | No |
| `POST` | `/api/auth/login` | Autentica y devuelve token JWT | No |

## Flujo de registro (`POST /api/auth/register`)

**Body esperado:**
```json
{ "name": "string", "email": "string", "password": "string" }
```

**Respuesta 201:**
```json
{
  "success": true,
  "message": "Usuario registrado correctamente",
  "data": { "id": 1, "name": "...", "email": "...", "created_at": "..." }
}
```

**Errores:** `400` si el email ya existe o faltan campos.

## Flujo de login (`POST /api/auth/login`)

**Body esperado:**
```json
{ "email": "string", "password": "string" }
```

**Respuesta 200:**
```json
{
  "success": true,
  "message": "Inicio de sesión exitoso",
  "data": {
    "token": "<JWT válido por 1 día>",
    "user": { "user_id": 1, "nombre": "...", "email": "..." }
  }
}
```

**Errores:** `400` si las credenciales son inválidas.

## Archivos

| Archivo | Ubicación | Descripción |
|---------|-----------|-------------|
| `auth.routes.js` | `src/routes/` | Define las rutas POST /register y POST /login |
| `auth.controller.js` | `src/controllers/` | Extrae parámetros del request, delega a service, responde |
| `auth.service.js` | `src/services/` | Validaciones, hash con bcrypt, firma JWT |
| `auth.repository.js` | `src/repositories/` | Consultas SQL: findUserByEmail, createUser |

## Tecnologías

- **bcrypt** (v6): hash de contraseñas con salt factor 10
- **jsonwebtoken** (v9): firma de tokens JWT con expiración de 1 día
- **pg**: pool de conexiones a PostgreSQL

## Bugs conocidos

> ⚠️ Hay una inconsistencia de nombres de campos entre capas:
> - El controller envía `name` pero el service espera `nombre` → el registro falla silenciosamente
> - El repository consulta columna `id` y `name`, pero el service accede a `user.user_id` y `user.nombre` → el login devuelve campos `undefined`
>
> Ver también: inconsistencia entre los tipos TypeScript del frontend (`id_usuario`, `nombre`) y las columnas reales de la BD (`id`, `name`).
