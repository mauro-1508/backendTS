# Logros y avisos dentro de la app

Las migraciones de este módulo llegan a `007_functional_achievements.sql`.
La Parte A de alertas reutiliza los contratos existentes y no necesita migración
ni reconstrucción del catálogo ni del progreso.

- `GET /api/achievements?catalogVersion=2`: progreso del usuario del JWT,
  localizado y con secretos ocultos hasta `achievedAt`. Los administradores con
  `users.manage` no son elegibles. El contador por sí solo no confirma desbloqueo.
- `POST /api/achievements/activity`: actividad validada del usuario autenticado;
  letras, ventanas activas y reproducción de voz. Las traducciones confirmadas
  llegan por el consumidor de eventos existente.
- `GET /api/notifications?unreadOnly=true&limit=100`: bandeja del usuario del JWT,
  ordenada de más reciente a más antigua. Mantiene su contrato y paginación.
- `PATCH /api/notifications/:id/read`: valida UUID y pertenencia al usuario;
  confirmación idempotente. El frontend la usa después de presentar la tarjeta.

La transacción bloquea por usuario, deduplica eventos y traducciones semánticas,
respeta preferencias y verifica cuentas eliminadas antes de avanzar progreso.
`notified_at` registra la creación de la notificación, no su presentación.
No cambiar esa semántica para afirmar una entrega visual que el backend desconoce.

El frontend establece una referencia de logros ya logrados por sesión habilitada,
consulta cada 20 segundos en primer plano y exige notificación y `achievedAt`.
Reinicia la referencia al reactivar avisos, regresar de segundo plano o tras error
de conexión, evitando reproducir históricos incluso en otro dispositivo. Pierde
avisos durante esos intervalos; el progreso persiste. Deduplica por logro en memoria
y marca leído después de presentar. Dos dispositivos activos pueden coincidir
antes del PATCH: no hay garantía exactamente una vez. La bandeja conserva avisos
no presentados; leerlos no obliga a reproducirlos al entrar de nuevo.

Las 21 reglas activas cubren traducciones, tiempo activo confirmado, voz finalizada,
palabra frecuente, vocabulario distinto, letras consultadas, ambos modos, días en
America/Bogota y categorías. Los tests de `functional_achievements` comprueban
fuentes y umbrales, con dobles en memoria. Las pruebas PostgreSQL requieren una
instancia aislada explícita mediante `PROFILE_TEST_DATABASE_URL`; no usar bases
de aplicación para ejecutarlas. La integración real y la revisión de dispositivos
siguen siendo comprobaciones distintas de las pruebas simuladas.
