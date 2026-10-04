# backend-traduce-señas

Backend de Traduce Señas separado en microservicios (Express + TypeScript), con
arquitectura hexagonal dentro de cada servicio. Plan completo: `MICROSERVICES_PLAN.md`.

```
packages/shared/            # config, JWT, middleware HTTP y bus de eventos (RabbitMQ) compartidos
services/api-gateway/       # único punto de entrada: JWT, rate limit y proxy a los servicios
services/iam-service/       # registro, login, roles, recuperación de contraseña
services/recognition-service/ # traducciones, plantillas de gestos, IA/entrenamiento
services/lexicon-service/   # catálogo de señas, alfabeto 3D y medios
services/analytics-service/ # métricas de uso a partir de eventos
services/profile-service/   # perfil, preferencias, notificaciones y logros
```

Cada servicio tiene su base de datos propia y se comunican por eventos (RabbitMQ), por ejemplo
`iam.UserRegistered` y `recognition.TranslationProduced`.

## Levantar todo con Docker

```
cp .env.example .env     # opcional: define JWT_SECRET, POSTGRES_PASSWORD, EMAIL_USER, EMAIL_PASS
docker compose up --build
```

Sin `.env` se usan valores de desarrollo. Para apagar: `docker compose down` (añade `-v` para borrar los datos).

## Puertos

| Componente | Puerto en el host |
|---|---|
| api-gateway | 8080 |
| iam / recognition / lexicon / analytics / profile | 3001 / 3002 / 3003 / 3004 / 3005 |
| postgres (iam, recognition, lexicon, analytics, profile) | 5433 / 5434 / 5435 / 5436 / 5437 |
| mongo | 27017 |
| rabbitmq | 5672 (panel: http://localhost:15672, guest/guest) |

**El frontend debe apuntar al gateway: `http://localhost:8080`.** No llama a los servicios directamente.

## Desarrollo sin Docker

```
npm install
# copia services/<servicio>/.env.example a services/<servicio>/.env y complétalo
npm run dev:all          # gateway + los 5 servicios con recarga
```

Con `RABBITMQ_URL` y `MONGO_URL` vacíos los servicios usan eventos y muestras en memoria.
Las variables de cada servicio están documentadas en `.env.example`.

## Tests y build

```
npm run build            # compila shared y todos los servicios
npm test                 # corre los tests de shared y de cada servicio (node:test)
```
