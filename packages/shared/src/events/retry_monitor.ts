import { HealthCheck } from '../http/health';
import { EventEnvelope } from './event_bus';

/**
 * Recuerda desde cuando reintenta cada evento un handler con `withRetry`. Hace falta porque un
 * handler con `attempts: Infinity` (la limpieza de iam.UserDeleted) que falla siempre nunca llega a
 * `.dead`, y RabbitMQ no cuenta el mensaje como pendiente mientras el consumidor lo tiene sin confirmar.
 * Vive en memoria: tras un reinicio el mensaje se reentrega y la cuenta empieza de nuevo.
 */
export interface RetryMonitor {
  /** El handler fallo y va a reintentar `event`; conserva la fecha del primer fallo. */
  retrying(event: EventEnvelope): void;
  /** El evento termino (con exito o rendido): deja de contarse. */
  settled(eventId: string): void;
  /** Eventos que llevan reintentando mas de `olderThanMs`. */
  stuck(olderThanMs: number): Array<{ eventId: string; type: string; retryingSeconds: number }>;
}

export const makeRetryMonitor = (now: () => number = Date.now): RetryMonitor => {
  const since = new Map<string, { type: string; since: number }>();
  return {
    retrying: event => {
      if (!since.has(event.eventId)) since.set(event.eventId, { type: event.type, since: now() });
    },
    settled: eventId => {
      since.delete(eventId);
    },
    stuck: olderThanMs => {
      const at = now();
      return [...since.entries()]
        .filter(([, entry]) => at - entry.since > olderThanMs)
        .map(([eventId, entry]) => ({ eventId, type: entry.type, retryingSeconds: Math.floor((at - entry.since) / 1000) }));
    },
  };
};

/** Mismo umbral que el outbox de iam: un evento sano se procesa en segundos. */
export const DEFAULT_CONSUMER_STUCK_AFTER_MS = 10 * 60_000;

/** Comprobacion de /health: `consumer_retrying` si un evento lleva demasiado reintentandose. */
export const makeConsumerRetryCheck = (
  monitor: RetryMonitor,
  stuckAfterMs = DEFAULT_CONSUMER_STUCK_AFTER_MS,
): HealthCheck => async () => {
  const events = monitor.stuck(stuckAfterMs);
  return events.length > 0 ? { issue: 'consumer_retrying', details: { events } } : {};
};
