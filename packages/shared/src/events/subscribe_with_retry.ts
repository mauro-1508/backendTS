import { exponentialBackoffMs } from './backoff';
import { EventHandler, EventSubscriber, Subscription } from './event_bus';

export interface SubscribeRetryOptions {
  /** Espera (ms) antes del reintento numero `attempt`. */
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string, error: unknown) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms).unref());

const defaultLog = (message: string, error: unknown) => console.error(message, error);

/**
 * Suscribe reintentando con backoff exponencial hasta lograrlo: un servicio no debe morir
 * (ni quedarse sin consumir) porque el broker aun no este arriba. Nunca rechaza.
 */
export const subscribeWithRetry = async (
  subscriber: EventSubscriber,
  subscription: Subscription,
  handler: EventHandler,
  options: SubscribeRetryOptions = {},
): Promise<void> => {
  const { backoffMs = exponentialBackoffMs, sleep = defaultSleep, log = defaultLog } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      await subscriber.subscribe(subscription, handler);
      return;
    } catch (error) {
      const waitMs = backoffMs(attempt);
      log(`[events] no se pudo suscribir ${subscription.queue}; reintento en ${waitMs} ms`, error);
      await sleep(waitMs);
    }
  }
};
