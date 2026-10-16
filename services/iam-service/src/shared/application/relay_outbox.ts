import { EventPublisher, PublishTimeoutError } from '@traduce/shared';
import { OutboxRepository } from '../ports/outbox_repository';

export const DEFAULT_OUTBOX_BATCH_SIZE = 50;
export const DEFAULT_OUTBOX_ALERT_ATTEMPTS = 5;
/** Reserva del lote: debe cubrir el peor caso de publicar el lote entero. */
export const DEFAULT_OUTBOX_LEASE_MS = 60_000;
export const DEFAULT_RETRY_BASE_MS = 5_000;
export const DEFAULT_RETRY_MAX_MS = 5 * 60_000;
export const DEFAULT_PURGE_EVERY_PASSES = 720;
export const DEFAULT_PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface RelayOutboxResult {
  published: number;
  failed: number;
}

/** Espera antes del reintento tras `previousAttempts` fallos: base * 2^n con tope. */
export const outboxRetryDelayMs = (previousAttempts: number, baseMs = DEFAULT_RETRY_BASE_MS, maxMs = DEFAULT_RETRY_MAX_MS): number =>
  Math.min(maxMs, baseMs * 2 ** previousAttempts);

/**
 * Publica los eventos pendientes del outbox sin tener una transaccion abierta durante el publish.
 * El broker debe confirmar cada uno (y, al ser mandatory, haberlo enrutado a una cola): si no, el
 * evento sigue pendiente con backoff exponencial y se reintenta con el MISMO eventId, de modo que
 * los consumidores idempotentes lo tratan como uno solo. En el primer timeout la pasada se corta
 * (el broker esta mal) y se liberan los eventos reservados que no se intentaron.
 */
export const makeRelayOutbox = (deps: {
  repository: OutboxRepository;
  publisher: EventPublisher;
  batchSize?: number;
  leaseMs?: number;
  alertAfterAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  purgeEveryPasses?: number;
  purgeAfterMs?: number;
  now?: () => Date;
  log?: (message: string) => void;
}) => {
  const { repository, publisher } = deps;
  const batchSize = deps.batchSize ?? DEFAULT_OUTBOX_BATCH_SIZE;
  const leaseMs = deps.leaseMs ?? DEFAULT_OUTBOX_LEASE_MS;
  const alertAfter = deps.alertAfterAttempts ?? DEFAULT_OUTBOX_ALERT_ATTEMPTS;
  const purgeEvery = deps.purgeEveryPasses ?? DEFAULT_PURGE_EVERY_PASSES;
  const purgeAfterMs = deps.purgeAfterMs ?? DEFAULT_PURGE_AFTER_MS;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string) => console.error(message));
  let passes = 0;

  const purgeOld = async (): Promise<void> => {
    try {
      const purged = await repository.purgePublishedBefore(new Date(now().getTime() - purgeAfterMs));
      if (purged > 0) log('[outbox] limpieza: ' + purged + ' evento(s) publicado(s) con mas de 7 dias');
    } catch (error) {
      log('[outbox] fallo la limpieza de publicados: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return async (): Promise<RelayOutboxResult> => {
    const result: RelayOutboxResult = { published: 0, failed: 0 };
    const events = await repository.claimBatch(batchSize, leaseMs);
    for (const [index, event] of events.entries()) {
      try {
        await publisher.publish(event.type, event.payload, { eventId: event.eventId, mandatory: true });
        await repository.markPublished(event.eventId);
        result.published++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const attempts = await repository.markFailed(event.eventId, message, outboxRetryDelayMs(event.attempts, deps.retryBaseMs, deps.retryMaxMs));
        result.failed++;
        // Una sola alerta por evento: justo al alcanzar el umbral (despues sigue reintentando con tope).
        if (attempts === alertAfter) {
          log('[outbox] ALERTA: ' + event.type + ' (' + event.eventId + ') lleva ' + attempts + ' intentos fallidos: ' + message);
        }
        if (error instanceof PublishTimeoutError) {
          await repository.release(events.slice(index + 1).map(pending => pending.eventId));
          break;
        }
      }
    }
    passes++;
    if (passes % purgeEvery === 0) await purgeOld();
    return result;
  };
};

export type RelayOutbox = ReturnType<typeof makeRelayOutbox>;
