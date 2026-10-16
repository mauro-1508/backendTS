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

Siguen separados: diagnóstico reproducible de cuenta inactiva, ocultar logros
y contador al administrador, definición de avisos administrativos/eventos/push,
validación integrada y acuerdos del equipo sobre consentimiento y autorías.
