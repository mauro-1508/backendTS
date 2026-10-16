# Verificación de esta entrega (2026-10-16)

Worktree /tmp/backendTS-profile-account-deletion, rama
integration/profile-account-deletion, base 3a1f2b3. Estado inicial limpio.
No se hizo git add, commit, push, despliegue ni escritura en bases. El checkout
original conserva c243fba y su .vscode/ sin seguimiento. No se instalaron paquetes.
Se utilizó Node 22.23.3 ya instalado; no se leyeron archivos .env ni credenciales.

## Resultados

- Build inicial de todos los workspaces: aprobado.
- Build definitivo de shared y los cuatro servicios afectados: aprobado.
- Tanda final de nueve archivos: 69 aprobadas, 2 omitidas (Analytics PostgreSQL),
  cero fallos. Incluye shared, consumidores, guards de muestras y fencing.
- Repositorio de plantillas: 4 aprobadas, conexión única y rechazo por borrado.
- Dos casos adicionales de publicador (provisión fallida y confirms concurrentes):
  2 aprobadas con broker simulado.
- Nuevos casos de dependencias IAM y save Analytics: 6 aprobadas con dobles PG.
- Total de estas regresiones finales: 81 aprobadas; no son integración real.
- La pasada previa incluyó relay_outbox (9 casos), verificación de correo,
  permisos de plantillas y chequeo estático del esquema. Hubo un error intermedio
  de declaraciones shared desactualizadas mientras se compilaba su API nueva;
  se recompiló shared y se repitieron las pruebas afectadas, aprobadas al final.
- Las dos tandas pequeñas de publicador y dependencias/save usaron
  TS_NODE_TRANSPILE_ONLY=1; las otras tandas usaron comprobación TypeScript.
  La compilación de producción se ejecutó además con tsc.

Logs locales de esta ejecución:
/tmp/profile-final-build.log, /tmp/profile-shared-build.log,
/tmp/profile-final-regressions.log, /tmp/profile-template-regression.log,
/tmp/profile-publisher-concurrency.log, /tmp/profile-legacy-regressions.log.

## Omitidas y límites

La suite de Profile PostgreSQL se cargó y quedó explícitamente omitida por no
haber PROFILE_TEST_DATABASE_URL en el entorno aislado (cero casos ejecutados).
Los dos casos nuevos enfrentan borrado con traducciones en ambos órdenes.
No se repitieron los seis casos anteriores que el usuario confirmó aprobados.

Los dos casos nuevos Analytics PostgreSQL quedaron omitidos por la misma razón.
Docker denegó acceso; sudo sin interacción requiere contraseña. El sondeo sin
credenciales del destino conocido no permitió verificar identidad/acceso. No
se escribió en esa instancia ni se intentó otra base. Infraestructura debe
habilitar el destino exclusivo antes de validar concurrencia real.

No se ejecutaron RabbitMQ real, MongoDB real ni Liquibase. Los asserts de SQL y
los dobles de conexión no prueban locks ni rollback en PostgreSQL. Faltan las
pruebas reales de failover, reserva vencida entre dos relays, ejecución de ambas
vías de migración y fallo parcial PG/Mongo.

Ver account-deletion.md para comandos de pruebas PG y requisitos de despliegue.
El caso reportado como cuenta inactiva necesita reproducción ficticia del
reportante/equipo IAM; ver inactive-accounts.md. La retención de muestras,
consentimiento y autorías sigue siendo la política existente, pendiente de
confirmación del equipo. No declarar Profile terminado con estas validaciones
reales pendientes.
