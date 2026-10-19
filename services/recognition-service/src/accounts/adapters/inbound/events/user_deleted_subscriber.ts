import {
  EVENT_TYPES, EventHandler, EventSubscriber, RetryHandlerOptions, isUserDeleted, subscribeWithRetry, withRetry, withValidPayload,
} from '@traduce/shared';
import { EraseAccountData } from '../../../application/erase_account_data';

/** Cola propia de este evento (el bus crea tambien `<cola>.dead` para los mensajes rechazados). */
export const USER_DELETED_QUEUE = 'recognition-service.user-deleted';

/**
 * iam.UserDeleted: ejecuta la limpieza de la cuenta (traducciones y muestras).
 * Un payload inválido se conserva en DLQ; los errores transitorios se reintentan sin confirmar el mensaje.
 */
export const makeUserDeletedHandler = (deps: {
  eraseAccountData: EraseAccountData;
  log?: (message: string) => void;
}): EventHandler => {
  const log = deps.log ?? ((message: string) => console.log(message));
  return withValidPayload(isUserDeleted, async ({ payload }) => {
    const { translations, samples } = await deps.eraseAccountData(payload.userId);
    log(`[recognition] limpieza completada: ${translations} traduccion(es), ${samples} muestra(s)`);
  }, undefined, 'reject');
};

/** No rechaza: si el broker aun no esta arriba reintenta en segundo plano con backoff. */
/** Los errores transitorios se reintentan sin límite con backoff y alertas periódicas. */
export const subscribeToUserDeleted = (
  subscriber: EventSubscriber,
  handler: EventHandler,
  retryOptions?: RetryHandlerOptions,
): Promise<void> =>
  subscribeWithRetry(subscriber, { queue: USER_DELETED_QUEUE, pattern: EVENT_TYPES.UserDeleted }, withRetry(handler, { attempts: Infinity, ...retryOptions }));
