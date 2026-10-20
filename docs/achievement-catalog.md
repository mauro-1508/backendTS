# Catálogo de logros obtenibles

## Comportamiento actual

El servidor publica únicamente reglas activas, disponibles y medidas. Actualmente
son cinco: `FIRST_TRANSLATION` (1), `TEN_TRANSLATIONS` (10), `FIFTY_TRANSLATIONS`
(50), `hundredSigns` (100) y `thousandSigns` (1.000 traducciones completadas).
Los tres originales conservan UUID, códigos, metas, puntos, textos y progreso.
Los dos adaptados conservan UUID, códigos, puntos e historia; 006 actualiza sus
metas y textos para contar traducciones completadas, nunca señas individuales.
`recognition.TranslationProduced` incrementa una traducción por `eventId` con
usuario, mediante el consumidor, transacción y bloqueo por usuario existentes.
Los contadores se congelan al desbloquearse. `achievedAt` acredita el desbloqueo;
alcanzar la meta numérica por sí solo no lo acredita en la presentación.

De los 24 requisitos de `004_achievement_catalog.sql`, dos se adaptan por decisión
explícita del equipo a traducciones completadas: 100 y 1.000. Los 22 restantes
(21 sin función/medición y un duplicado) se conservan como registros internos,
sin publicación ni promesas de funciones próximas. No se inventa progreso
retroactivo ni se eliminan filas de `user_achievements`, notificaciones o eventos
procesados. La adaptación no acredita aprendizaje ni cantidades de señas.

## Revisión individual de los 24 requisitos

| Logro | Condición | Evidencia actual o faltante | Clasificación / decisión |
|---|---|---|---|
| firstSign | Primera seña con cámara | Primera traducción ya premiada; no hay unidad de seña confirmada | Duplicado; retirar |
| hundredSigns | 100 traducciones completadas | TranslationProduced, +1 por evento nuevo procesado | Adaptación aprobada; disponible mediante 006 |
| thousandSigns | 1.000 traducciones completadas | TranslationProduced, +1 por evento nuevo procesado | Adaptación aprobada; disponible mediante 006 |
| fullConversation | >5 minutos sin pausas | Sin intervalos; equipo debe definir pausa | No viable; retirar |
| voiceOn | 25 usos de salida de voz | Speech.speak existe, sin registro de reproducción completada; definir uso válido | No viable hoy; retirar |
| twoWay | Ambos sentidos en una sesión | Falta flujo voz→señas y correlación de sesión | No viable; retirar |
| offline | Traducir con paquete offline LSC | Falta paquete identificable y ejecución offline | No viable; retirar |
| firstPractice | Completar una práctica | No existe práctica evaluable | No viable; retirar |
| steadyHand | 90% en ronda de 20 señas | Sin resultados evaluados; confianza del modelo no es precisión | No viable; retirar |
| perfectPulse | 20 señas sin error de forma | Sin evaluación de forma ni reglas de secuencia | No viable; retirar |
| sprinter | 30 señas en menos de un minuto | Sin ronda cronometrada validada | No viable; retirar |
| fingerspelling | Alfabeto completo sin ayudas | Sin evaluación ni registro de ayudas | No viable; retirar |
| honestReview | Repetir 50 señas antes falladas | Sin errores vinculados a repeticiones; definir unidades distintas | No viable; retirar |
| facialExpression | Aprobar expresión facial | Sin módulo, rúbrica ni evaluación | No viable; retirar |
| firstTen | Guardar 10 señas personales | Sin colección personal persistida; definir efecto de retirar/guardar | No viable; retirar |
| twoHundred | Dominar 200 señas | Equipo debe definir dominio; no hay medición | No viable; retirar |
| everyday | Dominar casa, comida y familia completas | Sin conjunto versionado ni dominio por integrante | No viable; retirar |
| numbersHours | Dominar números, fechas y horas | Sin conjunto finito evaluable ni resultados | No viable; retirar |
| regionalisms | Guardar 15 variantes conocidas | Sin guardado personal ni conocimiento previo acreditado | No viable; retirar |
| sevenDays | Practicar 7 días consecutivos | Sin prácticas válidas; rachas eliminadas | No viable; retirar |
| thirtyDays | Practicar 30 días consecutivos | Sin prácticas válidas; rachas eliminadas | No viable; retirar |
| beforeDawn | Practicar antes de las 7 diez veces | Sin prácticas; definir zona horaria y repeticiones diarias | No viable; retirar |
| sharedSign | Compartir una traducción fuera de la app | Copiar texto no demuestra compartir; falta resultado observable | No viable; retirar |
| bridge | Validar 20 propuestas comunitarias | Sin propuestas, procedencia ni validaciones autorizadas | No viable; retirar |

Se contrastaron Recognition (persistencia y TranslationProduced), Analytics
(tipos de eventos y proyecciones), Lexicon y TranslationScreen (Speech.speak,
cámara y copia). Un nombre de métrica o evento admitido por un tipo no demuestra
que exista su productor ni su contador. Consultar una seña no es aprenderla,
abrir el alfabeto no es completarlo e iniciar sesión no termina una práctica.
`SIGNS_LEARNED`, `ALPHABET_COMPLETED`, `SESSIONS_COMPLETED` y
`CATALOG_REQUIREMENT` no se publican ni se activan. No se implementan esos módulos.

## Publicación, disponibilidad y activación

- **Disponibilidad**: `available` significa que la regla usa la métrica implementada
  `TRANSLATIONS_COMPLETED`; `upcoming` queda como valor interno heredado para reglas
  sin medición, sin anuncios públicos.
- **Activación**: `is_active` habilita procesamiento y exposición. Una regla
  disponible puede estar desactivada; no acumula progreso ni se publica mientras
  esté desactivada. La colección no evita ni fuerza su activación.
- **Publicación**: ambas versiones requieren `is_active`, `available`, métrica
  implementada y meta positiva. `firstSign` se excluye por duplicación. La colección
  no excluye reglas medidas de v1: las cinco usan una métrica ya admitida por sus
  clientes. Se conserva el formato anterior mediante su serializador v1.

`005_obtainable_achievements.sql` sustituye la prohibición indiscriminada de activar
`collection=catalog` (`ck_achievement_legacy_publication`) por restricciones de
medición y activación. Desactiva métricas sin contador y el duplicado, y permite
clasificar como internos no disponibles los registros históricos sin medición.
No reactiva ninguna fila ni modifica metas, identidades o historia de usuarios.
Añade localizaciones de los tres logros funcionales sin reemplazar localizaciones
existentes. Las migraciones 001–005 permanecen intactas en esta adaptación.
`006_translation_milestones.sql` activa únicamente hundredSigns/thousandSigns,
con TRANSLATIONS_COMPLETED, metas 100/1.000 y textos es/en/fr/pt nuevos. No altera
points, UUID, códigos, filas de progreso, fechas de desbloqueo ni avisos previos.

## API y presentación

`GET /api/achievements` y `?catalogVersion=1` conservan `{ data: [...] }` y el
formato medido anterior sin metadatos nuevos. `?catalogVersion=2` mantiene
`{ data: [...], meta: { catalogVersion: 2 } }` con los metadatos de catálogo.
Ambas respuestas públicas contienen los mismos cinco UUID y el mismo progreso.
V1 sigue enviando exclusivamente campos medidos, sin collection, availability ni
localizations; v2 añade esos metadatos. Los nuevos códigos usan la métrica conocida
TRANSLATIONS_COMPLETED y metas positivas, sin centinelas ni progreso null.
Un servidor anterior a 006 puede seguir devolviendo tres y el frontend lo acepta.
Versiones distintas de 1/2 se rechazan con 400. Los filtros del caso de uso protegen
también repositorios alternativos que devuelvan reglas no publicables.

El frontend solicita v2 y sigue aceptando una respuesta v1 válida del servidor
anterior. No rellena un catálogo local, no inventa progreso y no reintenta respuestas
inválidas como ceros. Se conserva la lectura del formato `upcoming` para
compatibilidad con el servidor anterior; el servidor corregido no lo publica.
Al actualizar solo el frontend, un backend de la entrega 004 todavía podría
anunciar sus 24 requisitos: la retirada completa requiere desplegar el backend
corregido. No se ha realizado ningún despliegue durante esta corrección.

Los históricos funcionales se presentan primero, por meta ascendente en el
servidor: 1, 10, 50, 100, 1.000. El resumen y contador incluyen los cinco
disponibles (incluidos los tres históricos). Pendientes: tarjetas y medallas grises incluso si el contador alcanza
la meta sin `achievedAt`. Completados: acento del tema. Se mantienen las cuatro
paletas y las claves de idioma existentes. No hay sección, contador ni consultas
para administradores ni mientras el acceso esté pendiente o falle. Secretos
pendientes no revelan nombre, descripción ni localizaciones. Se conserva el
aislamiento por usuario, token y generación de sesión y el descarte de respuestas
tardías.

## Avisos compatibles

No cambia el contrato de notificaciones: `title`, `body`, `referenceType` y
`referenceId` mantienen sus tipos y significado. Al desbloquear, se usa
`user_preferences.ui_language` (ES/EN/FR/PT), la preferencia existente sincronizada
por el frontend. El prefijo y los textos del logro se traducen; si falta una
localización, se usa español o el texto original. Se respeta
`notificationsEnabled` y se marca notificado solo tras insertar el aviso.
Los avisos ya almacenados se conservan en su idioma original. Cambiar idioma
después no reescribe esos avisos. No se necesitan campos ni versiones adicionales.

## Migración y operación

En bases existentes, aplicar **005 después de 004 y 006 después de 005**.
No reejecutar migraciones anteriores después de 006. El proyecto usa SQL manual;
Compose solo ejecuta los archivos montados cuando crea un volumen nuevo. Se monta
006 para instalaciones nuevas. No recrear volúmenes existentes.

Procedimiento documentado para quien opere el entorno, no ejecutado sobre bases
de aplicación durante esta tarea (requiere tener aplicadas 001–004):

```sh
docker compose exec -T postgres-profile \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d profile \
  < services/profile-service/db/005_obtainable_achievements.sql
docker compose exec -T postgres-profile \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d profile \
  < services/profile-service/db/006_translation_milestones.sql
```

006 es transaccional y repetible: actualiza las dos filas por código, sin insertar
reemplazos, conceder puntos ni modificar historia. No cambia los tres logros
originales ni publica los otros 22 requisitos. Aplicar primero el esquema permite
que el consumidor existente mida ambos objetivos. El backend de la corrección
005 ya los procesa y publica en v2; el backend actualizado también los publica
en v1 con el formato medido anterior. Antes de 006 solo se publican tres.

Rollback de aplicación: mantener migraciones y filas. Un backend anterior a 004
que filtre is_active puede leer los cinco medidos sin métricas desconocidas.
Un backend de la entrega 004 puede volver a anunciar requisitos por su consulta
que ignora is_active para catálogo; no usarlo para restaurar el catálogo corregido.
No revertir borrando progreso.

## Inicio de medición y recompensa de los dos objetivos

La fecha real de activación será la confirmación de 006 en cada entorno; esta
tarea solo la ejecuta en una base de pruebas. Desde entonces el consumidor
existente procesa +1 por TranslationProduced con usuario y eventId no procesado.
No hay replay, backfill, consulta de un total antiguo ni asignación desde los tres
contadores congelados. Un usuario sin filas de estos objetivos comienza en cero,
aunque haya ganado los tres históricos: tras un evento nuevo tendrá 1/100 y
1/1.000. El bloqueo por usuario y la deduplicación por eventId son los existentes.
Un evento atrasado procesado por primera vez tras la activación también cuenta;
no se añade un filtro ficticio por fecha de emisión que el consumidor no utiliza.

Si ya existen filas de progreso o desbloqueos para esos UUID, se conservan tal cual,
sin resetearlos, sumarlos, completarlos ni adjudicarles una fecha de origen nueva.
Los contadores de cada objetivo se congelan al ganarlo y siguen sin ser un total
de traducciones de toda la vida del usuario. No se cambia la historia de avisos.

La puntuación de hundredSigns y thousandSigns en 004 es **0**. 006 no asigna ni
modifica points: si un entorno ya tiene otro valor, lo conserva. No se inventa una
recompensa de puntos, moneda o nivel. Su recompensa es **el desbloqueo del logro**,
con el aviso existente si el usuario tiene notificationsEnabled activado. Los
eventos AchievementUnlocked siguen llevando la puntuación almacenada sin cambios.

No se reconstruye historia ni se cambia el bus: Recognition usa publishQuietly
tras persistir, por lo que una publicación fallida puede dejar una traducción sin
reflejar en Profile. La deduplicación existente usa `eventId`, no translationId.
La fecha real de inicio del consumidor en cada entorno no está acreditada por el
repositorio. No se promete un total histórico reconstruido.

## Verificación reproducible

Pruebas de dominio/HTTP con repositorios en memoria y dobles: no equivalen a una
prueba de infraestructura. La integración usa exclusivamente PostgreSQL local
`127.0.0.1:55437/profile_gamification_test`, rol `gamification_test`, esquemas
aleatorios y datos ficticios. El helper verifica destino y no carga `.env` ni DB_*.
Con `PROFILE_TEST_PSQL`, aplica 004 dos veces y después 005 dos veces usando
`psql -X -v ON_ERROR_STOP=1 -f`; comprueba identidad, progreso, fechas y avisos,
restricciones, consultas v1/v2 y desbloqueo idempotente después de migrar.
translation_milestones.test.ts aplica 006 dos veces por psql, verifica conservación
de UUID/puntos/historia, procesa 1.000 eventos nuevos desde cero, comprueba 99/100
y 999/1.000, duplicados, aislamiento, contadores congelados y concurrencia al
desbloquear ambos objetivos. Sus fixtures históricos son exclusivamente ficticios.

```sh
PROFILE_TEST_DATABASE_URL=postgresql://gamification_test@127.0.0.1:55437/profile_gamification_test \
PROFILE_TEST_PSQL=/ruta/al/psql \
TS_NODE_PROJECT=tsconfig.base.json \
node --require ts-node/register --test --test-concurrency=2 \
  services/profile-service/tests/*.test.ts tests/postgres_schema.test.ts
```

Backend: `npm run build -w @traduce/profile-service`.
Frontend: `npm run typecheck` y `npm test -- --runInBand`.
El frontend se verifica con renderizado simulado de React Native, no con dispositivo.
No se accede al VPS, APIs publicadas ni bases de aplicación.

## Reconstrucción en rutas permanentes (2026-10-20)

Se recuperaron los scripts de cambios y pruebas del historial local de la sesión
del 19 de octubre, incluida su adaptación final a cinco objetivos. Se revisó el
código base de ambos worktrees antes de reconstruir. Las migraciones 001–004
se compararon byte a byte con HEAD y permanecen intactas. Los resultados del
19 de octubre no acreditan esta reconstrucción.

Rutas de trabajo: `~/Documentos/backendTS-achievements` y
`~/Documentos/frontendTS-achievements`, ambas en `fix/obtainable-achievements`.
Dependencias instaladas dentro de cada worktree mediante
`npm ci --offline --ignore-scripts`, sin cambios en los checkouts originales.
Las verificaciones utilizan Node 22.23.3 y PostgreSQL 16.15 temporal exclusivo
de pruebas. No se aplican migraciones a bases de aplicación.

Resultados ejecutados sobre los archivos reconstruidos (2026-10-20):

- Compilaciones de Shared y Profile: aprobadas.
- Suite completa Profile + postgres_schema: 133 aprobadas, 0 fallidas,
  0 omitidas, usando PostgreSQL 16.15 real y aplicación repetida por psql.
- Después de recuperar los dos últimos ajustes de pruebas, se volvió a ejecutar
  translation_milestones.test.ts: 3 aprobadas, 0 fallidas y 0 omitidas. Comprueba
  que un evento procesado antes de activar 006 no aporta progreso al repetirse,
  y conserva un desbloqueo previo con contador 1 aunque su nueva meta sea 1.000.
- TypeScript frontend (`tsc --noEmit`, script de typecheck): aprobado.
- Primer intento de la suite frontend: 142 aprobadas y un timeout de 30 segundos
  en la prueba de presentación de las 24 tarjetas del servidor anterior. Se
  repite la suite completa tras finalizar las pruebas backend, sin cambiar
  el límite temporal ni omitir la prueba.
- PostgreSQL temporal detenido al terminar la integración.
- Repetición completa frontend: 13 suites, 143 pruebas aprobadas, 0 fallidas
  y 0 omitidas en 27,43 segundos, con el mismo límite temporal.
- git diff --check: aprobado en ambos worktrees. Checkouts originales limpios;
  índices sin cambios; sin git add, commits ni push. No se ejecutó exportación
  web ni revisión visual en navegador/dispositivo en esta reconstrucción.
