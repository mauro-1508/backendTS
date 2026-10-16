import {
  EVENT_TYPES, EventHandler, EventSubscriber, RetryHandlerOptions, isUserDeleted, subscribeWithRetry, withRetry, withValidPayload,
} from '@traduce/shared';
import { EraseUserTranslations } from '../translations/application/erase_user_translations';
import { UnlinkUserSamples } from '../samples/application/unlink_user_samples';

/** Cola propia de este evento (el bus crea tambien `<cola>.dead` para los mensajes rechazados). */
export const USER_DELETED_QUEUE = 'recognition-service.user-deleted';

/**
 * iam.UserDeleted: borra las traducciones (Postgres, y registra al usuario como borrado) y desliga
 * al usuario de las muestras (Mongo: recorded_by = null; las muestras se conservan).
 * Los borrados son idempotentes, asi que una reentrega no hace dano. Un payload inválido se
 * conserva en DLQ; los errores transitorios se reintentan sin confirmar el mensaje.
 */
export const makeUserDeletedHandler = (deps: {
  eraseTranslations: EraseUserTranslations;
  unlinkSamples: UnlinkUserSamples;
  log?: (message: string) => void;
}): EventHandler => {
  const log = deps.log ?? ((message: string) => console.log(message));
  return withValidPayload(isUserDeleted, async ({ payload }) => {
    const translations = await deps.eraseTranslations(payload.userId);
    const samples = await deps.unlinkSamples(payload.userId);
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
