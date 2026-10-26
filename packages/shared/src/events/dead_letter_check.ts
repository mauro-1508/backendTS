import { HealthCheck } from '../http/health';

/** Mensajes guardados en `<cola>.dead` por cada cola que consume este servicio. */
export interface DeadLetterInspector {
  deadLetterCounts(): Promise<Record<string, number>>;
}

/**
 * Comprobacion de /health: un mensaje en `.dead` es un evento que nadie proceso (por ejemplo un
 * iam.UserDeleted rechazado), asi que el servicio queda `degraded` hasta que alguien lo revise.
 */
export const makeDeadLetterCheck = (inspector: DeadLetterInspector): HealthCheck => async () => {
  const counts = await inspector.deadLetterCounts();
  const withMessages = Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
  return Object.keys(withMessages).length > 0 ? { issue: 'dead_letters', details: withMessages } : {};
};
