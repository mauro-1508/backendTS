import { HealthCheck } from '@traduce/shared';
import { OutboxMonitor } from '../ports/outbox_repository';

/**
 * Un evento sano sale en segundos (el relay pasa cada 5 s). A los 10 minutos ya fallo unas 7 veces
 * con el backoff del relay: el broker no lo acepta o el relay no esta corriendo.
 */
export const DEFAULT_OUTBOX_STUCK_AFTER_MS = 10 * 60_000;

/** /health de iam: `outbox_backlog` si un evento (p. ej. iam.UserDeleted) lleva demasiado sin publicarse. */
export const makeOutboxHealthCheck = (deps: {
  monitor: OutboxMonitor;
  stuckAfterMs?: number;
  now?: () => Date;
}): HealthCheck => async () => {
  const { pending, oldestPendingAt } = await deps.monitor.pendingSummary();
  const now = (deps.now ?? (() => new Date()))();
  const ageMs = oldestPendingAt ? Math.max(0, now.getTime() - oldestPendingAt.getTime()) : 0;
  if (ageMs <= (deps.stuckAfterMs ?? DEFAULT_OUTBOX_STUCK_AFTER_MS)) return {};
  return { issue: 'outbox_backlog', details: { pending, oldestPendingSeconds: Math.floor(ageMs / 1000) } };
};
