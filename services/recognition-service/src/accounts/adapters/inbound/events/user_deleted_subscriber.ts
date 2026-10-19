import {
  EVENT_TYPES, EventHandler, EventSubscriber, RetryHandlerOptions, isUserDeleted, subscribeWithRetry, withRetry, withValidPayload,
} from '@traduce/shared';
import { EraseUserTranslations } from '../../../../translations/application/erase_user_translations';
import { UnlinkUserSamples } from '../../../../samples/application/unlink_user_samples';
import { EraseAccountData, makeEraseAccountData } from '../../../application/erase_account_data';

/** Cola propia de este evento (el bus crea tambien `<cola>.dead` para los mensajes rechazados). */
export const USER_DELETED_QUEUE = 'recognition-service.user-deleted';

/** Acepta el caso de uso ya armado o los dos pasos de limpieza sueltos. */
export type UserDeletedHandlerDeps = (
  | { eraseAccountData: EraseAccountData }
  | { eraseTranslations: EraseUserTranslations; unlinkSamples: UnlinkUserSamples }
) & { log?: (message: string) => void };

/**
 * iam.UserDeleted: ejecuta la limpieza de la cuenta (traducciones y muestras).
 * Un payload inválido se conserva en DLQ; los errores transitorios se reintentan sin confirmar el mensaje.
 */
export const makeUserDeletedHandler = (deps: UserDeletedHandlerDeps): EventHandler => {
  const log = deps.log ?? ((message: string) => console.log(message));
  const eraseAccountData = 'eraseAccountData' in deps ? deps.eraseAccountData : makeEraseAccountData(deps);
  return withValidPayload(isUserDeleted, async ({ payload }) => {
    const { translations, samples } = await eraseAccountData(payload.userId);
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
