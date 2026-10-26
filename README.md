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

## Recompensas de retos y medallas

La migración `services/profile-service/db/010_challenge_reward_achievements.sql` se aplica
después de 009. Añade `dailyChallengePoints500`, `dailyChallengePoints1000` y
`dailyChallengePoints3000`, publicados en catálogo v2 con `challengeRewards=1`. Las peticiones v2 anteriores
conservan sus 21 reglas para proteger sus validadores de métricas cerrados.
v1 conserva su vocabulario
y sus cinco reglas. No modifica las 21 reglas anteriores, sus UUID ni su historia.
Las tres medallas conceden **cero puntos adicionales** y tienen textos ES/EN/FR/PT.

La única medida es `sum(challenge_rewards.points)` del usuario: excluye catálogo,
progreso parcial y premios de logros. La migración inicializa también a usuarios
con recompensas anteriores, sin exigir otro reto. Reconoce metas alcanzadas con la
fecha de ejecución de la migración, sin inferir fechas históricas ni crear avisos.
Sin recompensas, las lecturas devuelven cero sin crear filas. Repetir 010 conserva
filas existentes y personalizaciones del catálogo. Las lecturas no escriben progreso.

Cada recompensa nueva recalcula el total dentro de la misma transacción y bloqueo
por usuario. Actualiza las tres medidas y desbloquea/notifica cada medalla una vez;
los reintentos no vuelven a sumar. El borrado usa las tablas existentes y conserva
`erased_users`, que impide recrear datos con eventos tardíos.

`GET /profile/challenges/today` añade `assignmentId`, `reward` (puntos y fecha reales,
o null) y las localizaciones de la instantánea. Las notificaciones añaden `typeCode`.
El frontend cruza `CHALLENGE_COMPLETED`, la referencia de asignación, finalización y
recompensa antes de presentar el aviso en la cola compartida de logros. No concede
puntos en el cliente. Servidores anteriores siguen siendo legibles sin afirmar una
recompensa que no confirman.

En una base existente, detener los consumidores de Profile durante la migración,
aplicar 009 si falta y luego 010 con `psql -X -v ON_ERROR_STOP=1`; después arrancar
el backend actualizado y el frontend. El montaje para bases nuevas y los comandos
de migración están en `docker-compose.yml`. No basta reiniciar un volumen existente:
los scripts de init solo se ejecutan sobre bases nuevas. No se ha ejecutado aquí
ninguna migración de aplicación ni despliegue.

Las pruebas de `challenge_reward_achievements*.test.ts` distinguen repositorios en
memoria de PostgreSQL real. Los fixtures del consumidor incluyen 009 y los del
esquema completo también 010; las pruebas históricas de 004/006 conservan su corte
de catálogo intencional. Usar Node 22. Las notas de validación y entrega de esta
tarea se guardan fuera del repositorio, en `~/Documentos/notas-recompensas-retos`.


### Total confirmado de puntos de retos del Perfil

`GET /api/profile/challenges/rewards/summary` requiere JWT y devuelve
`{ "success": true, "data": { "totalPoints": 0 } }`. La identidad procede solo del token;
se rechaza a quien tiene `users.manage` (403), igual que en retos/logros.
Reutiliza `ChallengeRepository.rewardTotal`: `COALESCE(SUM(points),0)` exclusivamente
en `challenge_rewards` del usuario. No se limita por metas de medallas ni suma puntos
del catálogo; no crea perfiles, asignaciones, recompensas, progreso ni notificaciones,
y evita el middleware de escritura del directorio administrativo.
La ruta es aditiva: no cambia los contratos anteriores ni requiere otra migración.
Errores de consulta o totales fuera del rango entero seguro fallan; no se convierten en cero.
