# Estado de Profile

El perfil y sus preferencias se recuperan por identidad mediante
makeRecoverUserProfile, sin depender de processed_events. Las filas existentes
se preservan; el nombre puede estar ausente o ser null. La recuperación no crea
actividad, logros ni avisos. Los comandos y controles del archivo están en
[profile-identity-recovery.md](profile-identity-recovery.md).

La eliminación local se coordina con registro, recuperación, PATCH de
preferencias y progreso por traducción usando el mismo advisory lock dentro de
UnitOfWork. Consultar erased_users antes de adquirirlo no basta. La protección
requiere la migración 002_erased_users.sql y solo aplica tras recibir UserDeleted.

Las pruebas PostgreSQL de eliminación concurrente se encuentran en
services/profile-service/tests/preferences_postgres.test.ts. Incluyen ambos
órdenes para registro, recuperación, preferencias y ahora traducciones. Los
resultados anteriores de seis casos se conservan como antecedentes; los casos
nuevos solo pueden darse por aprobados después de ejecutarlos en la instancia
exclusiva de pruebas.

La entrega entre servicios, migraciones y límites de finalización están en
[account-deletion.md](account-deletion.md). No declarar el dominio terminado
solo porque compila o pasan repositorios simulados.

Siguen separados: diagnóstico reproducible de cuenta inactiva,
definición de avisos administrativos/eventos/push,
validación integrada y acuerdos del equipo sobre consentimiento y autorías.

## Catálogo de logros

La ampliación, contrato de disponibilidad, preservación de los tres logros
anteriores y orden de despliegue están en [achievement-catalog.md](achievement-catalog.md).

La publicación es optativa por versión: GET /api/achievements conserva v1 (tres
logros medidos); catalogVersion=2 publica el catálogo ampliado. Aplicar 004 con
psql sobre volúmenes existentes ANTES del backend nuevo; el frontend puede
actualizarse antes o después. El montaje initdb no migra una base existente.
Los comandos, matriz de compatibilidad y rollback están en la documentación enlazada.

La corrección se validó en PostgreSQL 16.15 aislado (incluida reejecución por psql):
123 pruebas backend aprobadas, sin omisiones. No se ejecutó contra bases reales.
