# Eliminación de cuentas entre servicios

IAM elimina físicamente la cuenta y registra `iam.UserDeleted` en el mismo
commit. Su respuesta HTTP confirma esa operación local; no acredita que todos
los consumidores hayan terminado. No se introduce suspensión ni una espera
programada antes del borrado.

## Responsabilidades y concurrencia

- Profile borra perfil, preferencias, progreso y notificaciones del usuario.
  Mantiene catálogos y la marca técnica `erased_users`. Registro, recuperación,
  preferencias y traducciones comparten el bloqueo transaccional por usuario.
  Una recuperación de una cuenta marcada falla con `ACCOUNT_DELETED`.
- Analytics mantiene los hechos, desliga usuario/sesión y referencias USER.
  `save` y `unlinkUser` usan el mismo advisory lock. La comprobación previa de
  los casos de uso es solo una respuesta temprana; el repositorio comprueba
  nuevamente dentro de la transacción que inserta. Un registro tardío se omite,
  una traducción tardía se conserva desligada y las escrituras HTTP se rechazan.
- Recognition borra traducciones y desliga `recorded_by` en las muestras.
  La creación de traducciones, muestras y plantillas y el DELETE explícito de
  plantillas comprueban la marca bajo el mismo bloqueo PostgreSQL. Para crear
  una muestra, el bloqueo abarca la escritura Mongo: el borrado espera a que
  termine y después la desliga. No hay transacción distribuida PG/Mongo;
  si Mongo falla después del commit PG, se repite la limpieza idempotente.

Se conserva la política existente: las muestras y sus campos de consentimiento
no se borran; las plantillas y sus autorías no se alteran automáticamente.
Esto no prueba anonimización completa. Producto/equipo debe confirmar esa
política y el flujo de retirada de consentimiento; esta entrega no los redefine.

Una marca local solo protege después de recibir la eliminación. No existe
revocación global instantánea de todos los JWT ni acuse de finalización
persistido por servicio. No borrar las marcas ni reutilizar identificadores IAM.

## Entrega y recuperación

Antes de publicar un UserDeleted mandatory, el adaptador declara y enlaza las
TRES colas durables y sus DLQ: profile-service.user-deleted,
recognition-service.user-deleted y analytics-service.user-deleted. Si no puede
provisionar alguna, el outbox queda pendiente. Esto evita que solo una cola
existente permita marcar el evento como publicado. El rol AMQP de IAM necesita
permisos de configuración y escritura para esa topología.

La confirmación es individual por publicación. Los reintentos conservan el
ID y la fecha persistida del sobre. La reserva del outbox incluye claim_token:
un worker cuya reserva venció no puede confirmar, liberar o reprogramar otra
reserva. Un vencimiento puede duplicar entrega; los consumidores son idempotentes.
La migración 010 debe aplicarse antes de ejecutar el relay actualizado.

Los fallos transitorios de limpieza se reintentan sin límite con backoff acotado,
alertas periódicas y sin ACK. La conexión interrumpida permite redelivery desde
la cola durable. Un payload inválido no se reintenta infinitamente: se rechaza
hacia `<cola>.dead`, sin ejecutar limpieza. Supervisar y corregir esos mensajes;
no purgar colas ni DLQ como parte de la recuperación.

Mantener consumidor/cola durante despliegues. Una cola eliminada después de
confirmar un evento no puede reconstruir sus mensajes solo con publisher
confirms. RabbitMQ debe conservar sus volúmenes y políticas de durabilidad.
Los publicados se purgan del outbox según la política existente de siete días;
esto es retención técnica, no prueba de finalización de los consumidores.

## Migraciones y despliegue (no ejecutados en esta entrega)

Aplicar por servicio y revisar el destino antes de escribir. Los mounts initdb
solo actúan sobre volúmenes NUEVOS; no recrear ni borrar volúmenes existentes.

- IAM: 009_outbox_events.sql, 010, 011 y después 012_outbox_claim_token.sql.
- Profile: 002_erased_users.sql.
- Recognition: 003_erased_users.sql.
- Analytics: 002_erased_users.sql.

Liquibase: IAM incluye 015_account_deletion_outbox.xml, Analytics incluye
007_erased_users.xml. El changelog IAM exige previamente user_tokens,
user_roles, roles y users.status. El master histórico no construye por sí solo
el esquema runtime moderno: si faltan esas condiciones se detiene. Reconciliar
el esquema bajo revisión; NO ejecutar automáticamente la migración histórica
006 para salvar el arranque, porque modifica estados de cuentas existentes.

IAM limpia también user_role, user_auth, user_session y password_reset_token
cuando esas tablas legacy existen. No consulta tablas de otros servicios.
Las comprobaciones estáticas no sustituyen probar ambas vías de migración.

Actualizar consumidores y permisos/topología antes de habilitar el relay y
tráfico IAM. Desplegar código que requiere claim_token solo después de 010.
Tras despliegue verificar pendientes/antigüedad del outbox, reintentos de
consumidores y DLQ; publisher confirm no equivale a limpieza completa.

## Pruebas

Usar Node 22 y compilar shared antes de ejecutar tests TypeScript. No cargar
.env. Las pruebas unitarias usan datos ficticios y repositorios/broker simulados.

    npm run build -w @traduce/shared
    TS_NODE_PROJECT=tsconfig.base.json node --require ts-node/register --test \
      services/analytics-service/tests/atomic_erasure.test.ts \
      services/recognition-service/tests/active_account.test.ts \
      services/iam-service/tests/shared/outbox_fencing.test.ts \
      services/iam-service/tests/shared/relay_outbox.test.ts

Pruebas PostgreSQL: solo PROFILE_TEST_DATABASE_URL suministrado externamente
para 127.0.0.1:55437, base profile_gamification_test, rol gamification_test.
Los fixtures verifican destino e identidad antes de crear un esquema aleatorio;
lo eliminan al terminar. Nunca apuntar a bases de aplicación ni al VPS.

    PROFILE_PREFERENCES_PG_TESTS=1 TS_NODE_PROJECT=tsconfig.base.json \
      node --require ts-node/register --test \
      --test-name-pattern='eliminación concurrente' \
      services/profile-service/tests/preferences_postgres.test.ts
    TS_NODE_PROJECT=tsconfig.base.json node --require ts-node/register --test \
      services/analytics-service/tests/atomic_erasure_postgres.test.ts

Profile añade los dos órdenes de borrado contra traducciones a los seis casos
anteriores. Analytics añade los dos órdenes de save/borrado y observa espera
real del bloqueo con pg_blocking_pids. Sin URL exclusiva los tests se omiten;
una omisión no cuenta como integración aprobada.

Pendientes de validación
real: concurrencia nueva PG, failover RabbitMQ/colas ausentes, fencing con dos
relays reales, fallo parcial PG/Mongo y ambas vías de migración.
