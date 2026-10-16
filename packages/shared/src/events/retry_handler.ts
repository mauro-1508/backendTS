import { InvalidEventPayloadError } from './payload_validators';
import { exponentialBackoffMs } from './backoff';
import { EventHandler } from './event_bus';

export interface RetryHandlerOptions {
  /** Intentos totales antes de rendirse (el bus manda entonces el mensaje a `.dead`). */
  attempts?: number;
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string, error: unknown) => void;
}

export const DEFAULT_HANDLER_ATTEMPTS = 5;

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => { const timer = setTimeout(resolve, ms); timer.unref(); });

/**
 * Reintenta el handler con backoff ante errores pasajeros (BD caida un momento) antes de dejar
 * que el bus lo mande a la cola de mensajes muertos. Al agotar los intentos deja un log de ALERTA
 * y relanza el error. Solo para handlers idempotentes.
 */
export const withRetry = (handler: EventHandler, options: RetryHandlerOptions = {}): EventHandler => {
  const {
    attempts = DEFAULT_HANDLER_ATTEMPTS,
    backoffMs = (attempt: number) => exponentialBackoffMs(attempt, { baseMs: 500, maxMs: 10_000 }),
    sleep = defaultSleep,
    log = (message: string, error: unknown) => console.error(message, error),
  } = options;
  return async event => {
    for (let attempt = 0; ; attempt++) {
      try {
        await handler(event);
        return;
      } catch (error) {
        if (error instanceof InvalidEventPayloadError) throw error;
        if (attempt + 1 >= attempts) {
          log('[events] ALERTA: ' + event.type + ' (' + event.eventId + ') fallo ' + attempts + ' veces; va a la cola de mensajes muertos', error);
          throw error;
        }
        // La limpieza válida no se abandona: mensaje sin ACK, redelivery al reiniciar.
        if (attempts === Infinity && (attempt + 1) % DEFAULT_HANDLER_ATTEMPTS === 0) {
          log('[events] limpieza pendiente; reintentando ' + event.type, new Error('consumer_retry'));
        }
        await sleep(backoffMs(attempt));
      }
    }
  };
};
