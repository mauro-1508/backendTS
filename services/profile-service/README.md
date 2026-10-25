# Profile — retos diarios

Profile conserva arquitectura hexagonal: reglas de fecha y selección en `src/domain/challenge.ts`,
casos de uso en `src/application/daily_challenge.ts`, puerto `ChallengeRepository` y adaptador PostgreSQL.
La composición está en `profile.module.ts`; no se modifican otros servicios ni el gateway.

## Asignación y progreso

Las definiciones activas se ordenan por `code` y se elige el índice de días calendario desde
1970-01-01 módulo cantidad de definiciones. La fecha es America/Bogota, independiente del host.
Semillas: TRANSLATE_1 (1/5 puntos), TRANSLATE_3 (3/10), TRANSLATE_5 (5/15), TRANSLATE_8 (8/25).
Todos los usuarios elegibles sin asignación ven el mismo reto del día.

`GET /api/profile/challenges/today` exige JWT y toma identidad exclusivamente del token.
Conserva la exclusión administrativa por `users.manage`. Devuelve `{ success: true, data }` con
challengeId, code, name, description, targetCount, currentCount, points, completed, completedAt y date.
Los textos se localizan con las preferencias ES/EN/FR/PT (o DEFAULT_PREFERENCES).
Sin actividad devuelve progreso cero sin crear perfil, asignación, recibo ni processed_event.
Sin definiciones activas y sin asignación devuelve 200/data:null con mensaje. Las asignaciones
ya persistidas conservan su instantánea incluso si su definición cambia o se desactiva.
Una cuenta eliminada obtiene data:null sin recrearse.

Solo `TranslationProduced` avanza el reto: una traducción guardada y confirmada cuenta una vez,
no cada predicción ni cada palabra de una frase. Usa occurredAt para su fecha en Bogotá;
un evento de ayer solo puede avanzar su asignación de ayer. No hay reconstrucción ni replay.
Conserva elegibilidad existente: eligible=false se descarta; payloads antiguos sin ese campo
mantienen la compatibilidad actual. No se crean retos desde la antigua llamada sin payload.

El avance ocurre dentro del processEventOnce de traducciones existente, después del mismo
bloqueo por usuario, protección erased_users y recibo persistente por translationId.
No se ejecuta otro processEventOnce. El reto completado no se reabre y su contador se limita a la meta.

## Recompensa y aviso

`challenges.points` y la instantánea `user_challenges.points` expresan la recompensa prevista.
Los puntos efectivamente concedidos están exclusivamente en `challenge_rewards`, con PK
user_challenge_id, user_id lógico, points y granted_at. No se actualizan puntos históricos de logros.
Progreso, finalización, recompensa y notificación IN_APP se confirman o revierten juntos.
La unicidad de recompensa por asignación impide conceder puntos dos veces.

El aviso usa tipo CHALLENGE_COMPLETED y referencia CHALLENGE al UUID de la asignación.
Respeta notifications_enabled y DEFAULT_PREFERENCES. Desactivar avisos conserva puntos y
finalización. No se añade push de dispositivo ni se cambia el lector de avisos de logros.
El toast existente de logros no presenta retos. El aviso queda disponible en el listado de Profile.

Comprobación de solo lectura (operador: sustituir el parámetro por su usuario de prueba):

```sql
SELECT uc.challenge_date, uc.code, uc.current_count, uc.target_count, uc.completed_at,
       cr.points AS awarded_points, cr.granted_at
FROM user_challenges uc
LEFT JOIN challenge_rewards cr USING (user_challenge_id)
WHERE uc.user_id = $1;
```

El borrado utiliza el mismo bloqueo: elimina recompensas, progreso y avisos personales,
conserva definiciones y erased_users. Eventos tardíos no recrean los datos.

## Migración y despliegue manual

Nueva migración: `db/009_daily_challenges.sql`, transaccional y repetible. No modifica migraciones
anteriores. No hay FK entre servicios; las FK de retos son internas de Profile.
Compose monta la migración para inicializaciones nuevas y contiene el comando manual para
volúmenes existentes. Ese comando lo ejecuta el operador tras revisión y respaldo; no se ha
aplicado SQL a bases de aplicación durante esta implementación. No recrear volúmenes.
Aplicar 001–009 en orden antes de ejecutar el nuevo Profile, incluidos entornos exclusivos de pruebas.
Desplegar Profile antes del frontend. El prefijo existente /api/profile ya está encaminado.

## Verificación

```bash
npm run build
npx tsc -p services/profile-service/tsconfig.json --noEmit
npm test
# Conjunto nuevo, desde la raíz; usar Node >=20, preferentemente el de CI:
TS_NODE_PROJECT=tsconfig.base.json node -r ts-node/register --test services/profile-service/tests/daily_challenges*.test.ts
```

Dominio y casos de uso usan repositorios en memoria; la API levanta Express local con
verificación de identidades simulada. No prueban integración real entre servicios.
`daily_challenges_postgres.test.ts` prueba migración repetida, concurrencia entre dos conexiones,
deduplicación, rollback, puntos sin avisos y borrado en ambos órdenes con PostgreSQL real.
Solo admite PROFILE_TEST_DATABASE_URL para 127.0.0.1:55437/profile_gamification_test con usuario
gamification_test; no carga .env. Usa esquemas aleatorios desechables del helper existente.
Sin URL omite explícitamente las pruebas; GAMIFICATION_PG_TESTS=1 exige su ejecución y falla
si no hay conexión. CI ya proporciona esa instancia y bandera. No usar bases de aplicación.

Pendiente de evidencia local: PostgreSQL real, RabbitMQ/gateway/Recognition integrados y
validación visual real. Consultar las notas externas de ejecución para resultados exactos.
