# lexicon-service

Microservicio autónomo del catálogo de señas (LSC) y el alfabeto 3D. Express 5 + PostgreSQL.
No depende de otros paquetes del repositorio ni consulta la base de datos de iam.
Endpoints y reglas de negocio: [`src/README.md`](src/README.md).

## Arranque rápido

```
cp .env.example .env          # completar JWT_SECRET (>= 32 caracteres)
npm install
npm run dev                   # o: npm run build && npm start
npm test
```

Con Docker (servicio + su PostgreSQL con el esquema y el alfabeto sembrados):

```
# Requiere DB_USER, DB_PASSWORD y JWT_SECRET (copia .env.example a .env y complétalo)
docker compose up -d --build
curl http://localhost:3003/health
docker compose down -v
```

Solo el servicio publica puerto (3003); PostgreSQL y RabbitMQ quedan en la red interna de compose.
RabbitMQ es opcional: define `RABBITMQ_USER` y `RABBITMQ_PASSWORD`, ejecuta
`docker compose --profile events up -d` y usa `RABBITMQ_URL=amqp://USER:PASS@rabbitmq:5672`.

## Variables de entorno

| Variable | Defecto | Descripción |
|---|---|---|
| `PORT` | 3003 | Puerto HTTP |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | — / 5432 | PostgreSQL |
| `JWT_SECRET` | obligatorio | Mismo secreto con el que iam firma (HS256), mínimo 32 caracteres |
| `ROLE_SOURCE` | `none` | `none` o `jwt` (ver abajo) |
| `RABBITMQ_URL` | vacío | Vacío = eventos en memoria |
| `LEXICON_MEDIA_DIR` | `./public/lexicon` | Directorio de medios |
| `LEXICON_MEDIA_BASE_URL` | vacío | Origen público (CDN) para las URL de medios |

## Autenticación y roles

El servicio solo **verifica** JWT HS256. Acepta el payload `{ sub | user_id, email, roles? }`,
así que sirve tanto con los tokens actuales de iam (`{ user_id, email }`) como con los futuros.

Las rutas de administración exigen el rol `ADMIN`, resuelto por un puerto `RoleChecker`:

- `ROLE_SOURCE=none` (por defecto): no hay fuente de roles, así que toda escritura/administración
  responde **403 FORBIDDEN** con un mensaje que lo explica. Las lecturas públicas funcionan.
- `ROLE_SOURCE=jwt`: lee el claim `roles` del token.

**Pendiente en iam:** incluir `roles` (p. ej. `["ADMIN"]`) en el JWT para poder usar `ROLE_SOURCE=jwt`.

## Eventos

Publica en el exchange topic `traduce.events` (RabbitMQ) o en memoria si no hay URL:

- `lexicon.SignPublished` `{ lexiconId, code, type, language, letter, categoryId }`
- `lexicon.SignWithdrawn` `{ lexiconId, code }`

Un fallo del broker no rompe la operación: queda en el log.

## Base de datos

`db/003_lexicon.sql` es idempotente (esquema + alfabeto). Docker Compose lo ejecuta en el primer
arranque. Para Liquibase: `db/master.xml` con `db/liquibase.properties.example`.
