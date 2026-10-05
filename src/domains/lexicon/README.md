# Dominio `lexicon`

Catálogo de señas de LSC (letras, palabras y frases) con sus recursos multimedia.
El alfabeto no es una estructura aparte: son las filas con `type = 'LETTER'`.
Modelo de datos y reglas: `docs/06-data/domains/04-lexicon.md`.

> `code` es la clase que predice el reconocedor (`LETTER_A`, `GREETING_HELLO`).
> No se renombra una vez publicado. Una seña no se borra: se pasa a `INACTIVE`.

## Base de datos

```
psql -h localhost -p 5433 -U postgres -d traduce_senas -f backend/migrations/003_lexicon.sql
```

Crea o completa `categories`, `sign_lexicon`, `sign_localizations` y `multimedia_resource` (es compatible con las tablas
de los changelogs 009-011 de Liquibase; el 012 ejecuta este mismo archivo) y siembra
las 27 letras con su miniatura y su modelo 3D. Se puede ejecutar varias veces.

## Endpoints (`/api/lexicon`)

Las lecturas aceptan `?lang=ES|EN` (por defecto ES): `word`, `meaning` y `description` salen de la
localización en ese idioma, con respaldo a ES y luego a cualquiera. (`language` sigue siendo la lengua
de señas, `LSC`.) Las lecturas públicas solo devuelven señas `ACTIVE`.

"ADMIN" = JWT válido **y** rol `ADMIN` en `user_role` (middleware `requireRole` de `shared/http`). Sin
rol responde 403 `FORBIDDEN`.

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| GET | `/` | — | Lista señas activas. Filtros: `type`, `language`, `category` (nombre), `q`, `lang`. Con `q` ordena por relevancia (exacto > empieza por > contiene, también contra `code`) y, sin resultados, `data: []` con `message` |
| GET | `/alphabet` | — | Las 27 letras en orden (Ñ después de N) |
| GET | `/search?q=` | — | Igual que `/?q=` |
| GET | `/categories` | — | `[{ categoryId, name, description, signCount }]` (cuenta solo ACTIVE) |
| POST | `/categories` | ADMIN | Crea categoría `{ name, description? }` |
| PATCH | `/categories/:id` | ADMIN | Edita `{ name?, description? }` |
| DELETE | `/categories/:id` | ADMIN | Elimina; 409 `CATEGORY_IN_USE` si tiene señas |
| GET | `/admin/signs` | ADMIN | Lista con DRAFT/INACTIVE. Filtros: `status`, `type`, `category`, `q`, `lang` |
| GET | `/admin/signs/:code` | ADMIN | Detalle con `localizations`, en cualquier estado |
| GET | `/:code` | — | Una seña activa con recursos y `localizations: [{ uiLanguage, name, meaning, description }]` |
| POST | `/` | ADMIN | Crea en `DRAFT` (ignora `status`): `{ code, type?, letter?, category \| categoryId, localizations?, word?, description?, animated?, displayOrder? }`. `word`/`description` = localización ES; el nombre ES es obligatorio |
| PATCH | `/:code` | ADMIN | Edita (no cambia `code` ni `status`); `word`/`description` editan la localización ES |
| POST | `/:code/publish` | ADMIN | `DRAFT`/`INACTIVE` → `ACTIVE` (exige nombre ES) |
| DELETE | `/:code` | ADMIN | Retira la seña (`status = INACTIVE`) |
| PUT | `/:code/localizations/:lang` | ADMIN | Crea o reemplaza la localización `{ name, meaning?, description? }` (`:lang` = ES\|EN) |
| POST | `/:code/resources` | ADMIN | Agrega recurso `{ type: MODEL_3D\|IMAGE\|VIDEO\|GIF, url, mimeType?, displayOrder?, description? }`; 409 `POSITION_TAKEN` si la posición está ocupada |
| DELETE | `/:code/resources/:id` | ADMIN | Quita un recurso |
| GET | `/media/*` | — | Archivos de `public/lexicon/` (modelos .glb y miniaturas) |

Los listados (`/`, `/search`, `/admin/signs`) paginan con `limit` (defecto y máximo 100) y `offset` (≥ 0); `q` admite hasta 100 caracteres y la respuesta trae `meta: { limit, offset }`. `/alphabet` no pagina.

La `url` de un recurso es una ruta relativa de medios (`alfabeto/glb/A.glb`; extensiones glb, gltf, png, jpg, jpeg, webp, gif, mp4, webm) o una URL `https` del origen de `LEXICON_MEDIA_BASE_URL` (sin esa variable no se aceptan absolutas). Los `code` `ALPHABET`, `SEARCH`, `CATEGORIES`, `ADMIN` y `MEDIA` están reservados.

Errores: `{ success: false, code, message }` con `VALIDATION_ERROR` (400), `SIGN_NOT_FOUND` y
`CATEGORY_NOT_FOUND` (404), `CODE_TAKEN`, `LETTER_TAKEN`, `CATEGORY_NAME_TAKEN`, `CATEGORY_IN_USE` y `POSITION_TAKEN` (409), `FORBIDDEN` (403).

Los recursos guardan rutas relativas (`alfabeto/glb/A.glb`) y la API las devuelve como
URL absolutas. Variables opcionales: `LEXICON_MEDIA_DIR` (otro directorio de medios) y
`LEXICON_MEDIA_BASE_URL` (servirlos desde un CDN).

## Modelos 3D del alfabeto

Salen de `modelado/` (scripts de Blender, ver su README). Si se regeneran, copiar
`modelado/glb/*.glb` y `modelado/thumbs/*.png` a `backend/public/lexicon/alfabeto/`
y a `frontend/src/assets/alfabeto/` (la app los trae empaquetados para funcionar sin red).
