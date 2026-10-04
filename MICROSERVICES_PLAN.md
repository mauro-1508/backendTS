# Plan: separar el backend en microservicios

Rama: `feat/microservices-split`. Fuente de verdad de la arquitectura: repo docs `09-microservices/service-catalog.md` y `07-api/contracts/openapi/*.yaml`.

## Estructura final (npm workspaces)

```
backend/
  package.json            # workspaces: ["packages/*", "services/*"]; scripts: build, test, dev:all
  tsconfig.base.json
  docker-compose.yml      # gateway, 5 servicios, 5 postgres, mongo, rabbitmq
  packages/shared/        # @traduce/shared
    src/config/           # loadConfig(prefix) leyendo env; sin process.env disperso
    src/database/         # makePgPool(config), makeMongo(config)
    src/http/             # errorHandler, makeAuthMiddleware (JWT), makeRequireRole (lee roles del token)
    src/security/         # jwtTokenProvider: payload { sub, email, roles[] }
    src/events/           # EventBus port + RabbitMqEventBus (amqplib, exchange topic `traduce.events`) + InMemoryEventBus (tests / RABBITMQ_URL vacío)
  services/
    api-gateway/          # :8080  proxy por prefijo, valida JWT si viene, CORS, rate limit, GET /health
    iam-service/          # :3001  auth + users (dominios actuales auth, users) + roles en el JWT
    recognition-service/  # :3002  translations + ia (sign-templates); Mongo para gesture_samples
    lexicon-service/      # :3003  lexicon (+ public/lexicon)
    analytics-service/    # :3004  nuevo: consume eventos y expone estadísticas
    profile-service/      # :3005  nuevo: perfil/preferencias, notificaciones, logros
```

Cada servicio: `src/` hexagonal (domain, application, ports, adapters) copiado tal cual del dominio actual, `cmd/main.ts`, `package.json`, `Dockerfile`, `db/` (Liquibase changelogs o SQL sólo con SUS tablas), `tests/`, `GET /health`.

## Rutas públicas (gateway)
| Prefijo | Servicio | Nota |
|---|---|---|
| `/api/auth`, `/api/users` | iam | |
| `/api/translations`, `/api/recognition`, `/api/sign-templates`, `/api/samples` | recognition | `/api/sign-templates` se mantiene por compatibilidad con el frontend actual |
| `/api/lexicon` | lexicon | incluye `/api/lexicon/media` |
| `/api/analytics` | analytics | |
| `/api/profile`, `/api/notifications`, `/api/achievements` | profile | |

## Datos (database per service, sin FK entre servicios)
- iam: users, role, user_role, user_auth, user_session, password_reset_token
- recognition: translations, sign_templates (+ Mongo `gesture_samples`)
- lexicon: categories, sign_lexicon, sign_localizations, multimedia_resource
- analytics: usage_event (+ agregados)
- profile: user_profiles (preferencias), notifications, achievements, user_achievements (usar nombres de 06-data)
`user_id` en otros servicios es un id lógico, sin FK.

## Eventos (RabbitMQ, routing key `<servicio>.<Evento>`, nombres del catálogo de dominio)
- iam publica `iam.UserRegistered` → profile crea el perfil.
- recognition publica `recognition.TranslationProduced` → analytics registra uso; profile evalúa logros.
- lexicon publica `lexicon.SignPublished` / `lexicon.SignWithdrawn` → recognition (log por ahora).
Handlers idempotentes.

## Arreglos pendientes de la auditoría de lexicon (aplicar al moverlo)
1. FK multimedia→sign_lexicon: recrearla explícitamente con ON DELETE CASCADE en el SQL.
2. Unicidad de categorías case-insensitive en BD: índice único sobre lower(name).
3. `npm test` compatible con Node 20 (sin glob en `node --test`; listar archivos con un script o usar find).
4. `LEXICON_MEDIA_BASE_URL` leído una vez en config e inyectado al controlador.
5. `require_role` 500 con `code` como el resto de errores.

## Reglas
- No romper comportamiento: mismos endpoints y respuestas que hoy (salvo prefijos nuevos ya listados).
- Los 148 tests actuales deben seguir pasando (moverlos al servicio que corresponda).
- Commits pequeños en español con Conventional Commits, uno por paso.
