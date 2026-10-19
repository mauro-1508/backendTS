# Servicio `recognition-service`

Guarda las traducciones del usuario, las plantillas de señas y las muestras de gestos. Escucha en el puerto 3002.

El reconocimiento corre en el cliente (MediaPipe + DTW/KNN en el frontend). Este servicio no infiere: guarda y reparte. El detalle del motor de plantillas está en [src/ia/README.md](src/ia/README.md).

## Qué hace

| Área | Qué guarda | Quién la usa |
|---|---|---|
| Traducciones | Cada traducción del usuario, su historial y estadísticas | La app; analytics y profile consumen `TranslationProduced` |
| Plantillas (`ia`) | Plantillas estáticas (abecedario) y de movimiento (palabras) | La pantalla de traducción las baja al abrir; los administradores las importan |
| Muestras | Repeticiones de señas como landmarks, con consentimiento | Solo ADMIN, para entrenar |

## Arquitectura

Hexagonal por módulo. Árbol real de `src/`:

```
src/
├── app.ts                  Express: monta los routers, /health y errorHandler
├── config.ts               Lee MONGO_URL
├── recognition.module.ts   Composición: única raíz que elige implementaciones
├── accounts/               Reacciona a iam.UserDeleted y limpia la cuenta
├── common/                 Núcleo compartido: errores, dimensiones de landmarks, cuenta activa
├── ia/                     Plantillas de señas y motor de comparación
├── samples/                Muestras de gestos (MongoDB o memoria)
└── translations/           Traducciones, historial y estadísticas
```

Cada módulo sigue la misma forma: `domain/`, `application/`, `ports/inbound|outbound/` y `adapters/inbound|outbound/`. El punto de entrada es `cmd/main.ts`, fuera de `src/`.

| Módulo | Responsabilidad |
|---|---|
| `translations` | Crear, listar y borrar (lógico) traducciones; estadísticas globales y propias; publica `TranslationProduced` |
| `ia` | Importar, listar y borrar plantillas; motor de comparación; suscriptor de `lexicon.*` |
| `samples` | Registrar y listar muestras de gestos; valida el consentimiento |
| `accounts` | Caso de uso de limpieza de cuenta al recibir `iam.UserDeleted` |
| `common` | Errores compartidos (`AccountErasedError`), constantes de landmarks y `withActiveAccount` (bloquea escrituras de cuentas borradas) |
| `recognition.module.ts` | Crea los repositorios, cablea los módulos y suscribe los eventos |

Reglas de dependencias:

- `domain/` no importa nada externo: ni Express, ni `pg`, ni `mongodb`, ni el paquete compartido.
- `application/` depende de los ports, no de los adaptadores.
- Los adaptadores (Postgres, Mongo, memoria, HTTP, eventos) implementan los ports.
- Los módulos solo comparten código a través de `common/`; el resto se une en `recognition.module.ts`.
- Los casos de uso devuelven datos de dominio. Los controladores arman el sobre `{ success, message, data }`.

## Endpoints

El gateway enruta estos prefijos hacia este servicio (`services/api-gateway/src/route_table.ts`).

Traducciones (`/api/translations`, todas requieren JWT):

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/translations` | Guarda una traducción `{ outputText, type, inputText?, confidence?, source? }`. Responde 201 |
| GET | `/api/translations/history?limit&offset` | Historial propio. `limit` por defecto 50, máximo 200 |
| GET | `/api/translations/stats` | Estadísticas globales. Requiere el permiso `stats.read`; si falta, 403 |
| GET | `/api/translations/me/stats` | Estadísticas propias |
| DELETE | `/api/translations/:id` | Borrado lógico de una traducción propia |

Plantillas (`/api/recognition/sign-templates`; la ruta anterior `/api/sign-templates` sigue activa para el frontend):

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/?kind=static\|motion&label=` | Lista plantillas. Es pública |
| POST | `/` | Importa un lote. Requiere JWT y el permiso `models.manage`. Responde 201 con los ids |
| DELETE | `/:id` | Borra una plantilla. Requiere JWT y `models.manage` |

Muestras (`/api/samples`, solo ADMIN):

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/` | Registra una repetición. Responde 201 |
| GET | `/?signCode=` | Lista muestras, opcionalmente de una seña |

Otros: `GET /health` responde `{ status: 'ok', service: 'recognition-service' }`.

Errores: la mayoría de validaciones responden 400 con `{ success: false, message }`. Una cuenta borrada responde 401 con `code: 'ACCOUNT_DELETED'`.

## Eventos

| Sentido | Evento | Cola | Comportamiento |
|---|---|---|---|
| Publica | `recognition.TranslationProduced` | — | Payload `{ translationId, userId, gloss, text, occurredAt }`. Si el bus falla, la traducción se guarda igual |
| Consume | `lexicon.*` (`SignPublished`, `SignWithdrawn`) | `recognition-service.lexicon-events` | Solo deja constancia en el log. Ignora `eventId` repetidos (memoria del proceso) |
| Consume | `iam.UserDeleted` | `recognition-service.user-deleted` | Borra las traducciones del usuario, lo marca en `erased_users` y pone `recorded_by = null` en sus muestras. Los errores transitorios se reintentan; un payload inválido va a la cola `.dead` |

Sin `RABBITMQ_URL`, los eventos viajan en memoria.

## Persistencia

PostgreSQL, base `recognition`:

| Tabla | Script | Contenido |
|---|---|---|
| `translations` | `db/001_translations.sql` | Traducciones, con borrado lógico (`is_deleted`) |
| `sign_templates` | `db/002_sign_templates.sql` | Plantillas: `kind` (`static` o `motion`) y `features` en JSONB |
| `erased_users` | `db/003_erased_users.sql` | Usuarios borrados, para impedir escrituras posteriores |

Los scripts son idempotentes y se aplican así (desde la raíz del repo):

```
psql -h localhost -p 5434 -U postgres -d recognition -f services/recognition-service/db/001_translations.sql
```

Repetir con 002 y 003. El `docker-compose.yml` los monta al crear el volumen.

MongoDB guarda las muestras en la colección `gesture_samples`, con índices por `sign_code`, `capture_session_id` y `recorded_by`. Sin `MONGO_URL`, las muestras viven en memoria y se pierden al reiniciar.

## Cómo correrlo

Desde la raíz del monorepo:

```
npm install
copy services\recognition-service\.env.example services\recognition-service\.env
npm run dev -w @traduce/recognition-service      # nodemon + ts-node, recarga al cambiar src
npm run build -w @traduce/recognition-service    # tsc, genera dist/
npm start -w @traduce/recognition-service        # node dist/cmd/main.js (requiere build previo)
npm test                                         # desde la raíz: compila shared y ejecuta todos los *.test.ts
```

Variables de `.env.example`:

| Variable | Valor de ejemplo | Uso |
|---|---|---|
| `PORT` | `3002` | Puerto HTTP |
| `DB_HOST`, `DB_PORT` | `localhost`, `5434` | Conexión a Postgres |
| `DB_USER`, `DB_PASSWORD` | vacíos | Credenciales de Postgres |
| `DB_NAME` | `recognition` | Base de datos |
| `JWT_SECRET` | vacío | Obligatorio, mínimo 32 caracteres. Debe ser el mismo de iam-service |
| `RABBITMQ_URL` | vacío | Vacío = eventos en memoria |
| `MONGO_URL` | vacío | Vacío = muestras en memoria |

Cada variable también acepta el prefijo `RECOGNITION_` (p. ej. `RECOGNITION_DB_HOST`), que tiene prioridad sobre la genérica. El servicio no arranca sin `JWT_SECRET`.

## Entrenamiento

Conversión de datasets y carga de plantillas: ver [training/README.md](training/README.md). Los scripts son los `ia:*` de `package.json` (por ejemplo, `npm run ia:upload-templates -w @traduce/recognition-service`).
