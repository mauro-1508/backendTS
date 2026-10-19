/** Colas durables de limpieza: deben existir aunque un consumidor aún no haya arrancado. */
export const USER_DELETED_QUEUES = [
  'profile-service.user-deleted',
  'recognition-service.user-deleted',
  'analytics-service.user-deleted',
] as const;
