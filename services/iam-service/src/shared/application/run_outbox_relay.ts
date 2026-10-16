import { RelayOutbox } from './relay_outbox';

export const DEFAULT_OUTBOX_INTERVAL_MS = 5000;

export interface OutboxRelayLoop {
  stop(): void;
}

/**
 * Ejecuta el relay cada `intervalMs` sin solaparse consigo mismo y sin tumbar el proceso si
 * una pasada falla (la base de datos puede estar caida un momento). El timer no retiene el proceso.
 */
export const startOutboxRelayLoop = (
  relay: RelayOutbox,
  options: { intervalMs?: number; log?: (message: string, error: unknown) => void } = {},
): OutboxRelayLoop => {
  const log = options.log ?? ((message: string, error: unknown) => console.error(message, error));
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    relay()
      .catch(error => log('[outbox] fallo una pasada del relay', error))
      .finally(() => { running = false; });
  }, options.intervalMs ?? DEFAULT_OUTBOX_INTERVAL_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
};
