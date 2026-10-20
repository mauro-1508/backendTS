# backend-traduce-señas

Backend de Traduce Señas separado en microservicios (Express + TypeScript), con
arquitectura hexagonal dentro de cada servicio. Plan completo: `MICROSERVICES_PLAN.md`.

```
packages/shared/            # config, JWT, middleware HTTP y bus de eventos (RabbitMQ) compartidos
services/api-gateway/       # único punto de entrada: JWT, rate limit y proxy a los servicios
services/iam-service/       # registro, login, verificación de correo, RBAC (roles y permisos), cuenta y recuperación de contraseña
services/recognition-service/ # traducciones, plantillas de gestos, IA/entrenamiento
services/lexicon-service/   # catálogo de señas, alfabeto 3D y medios
services/analytics-service/ # métricas de uso a partir de eventos
services/profile-service/   # perfil, preferencias, notificaciones y logros
```

Cada servicio tiene su base de datos propia y se comunican por eventos (RabbitMQ), por ejemplo
`iam.UserRegistered` y `recognition.TranslationProduced`.

## Levantar todo con Docker

```
cp .env.example .env     # obligatorio: rellena JWT_SECRET (32+ caracteres) y las contraseñas
docker compose up --build
```

Variables obligatorias en `.env` (sin valor por defecto; compose falla si faltan):
`JWT_SECRET`, `POSTGRES_PASSWORD`, `MONGO_ROOT_PASSWORD`, `RABBITMQ_PASSWORD`.
Opcionales: `MONGO_ROOT_USER` y `RABBITMQ_USER` (por defecto `signa`), `CORS_ORIGINS`, `EMAIL_USER`, `EMAIL_PASS`.
Evita `@ : / ? #` en las contraseñas: van dentro de `MONGO_URL` y `RABBITMQ_URL`.
Para apagar: `docker compose down` (añade `-v` para borrar los datos).

## Puertos

| Componente | Puerto en el host |
|---|---|
| api-gateway | 8080 (único publicado a toda la red) |
| postgres (iam, recognition, lexicon, analytics, profile) | solo 127.0.0.1: 5433 / 5434 / 5435 / 5436 / 5437 |
| mongo | solo 127.0.0.1: 27017 |
| rabbitmq | panel solo en 127.0.0.1:15672 (usuario/contraseña de `.env`); AMQP no se publica |
| servicios 3001-3005 | no se publican; solo accesibles dentro de la red de Docker |

`CORS_ORIGINS` es la lista blanca (separada por comas) de orígenes web que pueden llamar al gateway; por defecto Expo web (`http://localhost:8081`, `http://localhost:19006`). Las apps nativas no envían `Origin` y no dependen de ella.

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
