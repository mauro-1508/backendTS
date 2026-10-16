import { EVENT_TYPES, EventEnvelope, EventSubscriber, isUserDeleted, withRetry, withValidPayload } from '@traduce/shared';
import { CONSUMED_EVENTS, TranslationProducedPayload, UserRegisteredPayload } from '../../../domain/events';
import { makeProfileModule } from '../../../profile.module';

const USER_REGISTERED_QUEUE = 'profile-service.user-registered';
const TRANSLATION_PRODUCED_QUEUE = 'profile-service.translation-produced';
export const USER_DELETED_QUEUE = 'profile-service.user-deleted';

type EventHandlers = ReturnType<typeof makeProfileModule>['eventHandlers'];

const hasUserId = (payload: unknown): payload is { userId: string | number } => {
  const userId = (payload as { userId?: unknown } | null)?.userId;
  return typeof userId === 'string' || typeof userId === 'number';
};

/**
 * Un evento sin userId nunca se podra procesar: se registra y se descarta (reintentarlo
 * solo bloquearia la cola). Los errores de base de datos si se propagan para reintentar.
 */
const withValidUser = <T extends { userId: string }>(
  handle: (event: EventEnvelope, payload: T) => Promise<void>,
) => async (event: EventEnvelope): Promise<void> => {
  if (!hasUserId(event.payload)) {
    console.error(`[profile] evento ${event.type} ${event.eventId} sin userId, se descarta`);
    return;
  }
  const payload = { ...(event.payload as object), userId: String(event.payload.userId) } as T;
  await handle(event, payload);
};

export const subscribeToEvents = async (subscriber: EventSubscriber, handlers: EventHandlers): Promise<void> => {
  await subscriber.subscribe(
    { queue: USER_REGISTERED_QUEUE, pattern: CONSUMED_EVENTS.UserRegistered },
    withValidUser<UserRegisteredPayload>((event, payload) => handlers.registerUserProfile(event.eventId, payload)),
  );
  await subscriber.subscribe(
    { queue: TRANSLATION_PRODUCED_QUEUE, pattern: CONSUMED_EVENTS.TranslationProduced },
    withValidUser<TranslationProducedPayload>(async (event, payload) => {
      await handlers.recordTranslation(event.eventId, payload.userId);
    }),
  );
  // iam.UserDeleted usa el contrato compartido (userId numerico validado); un payload invalido se descarta.
  await subscriber.subscribe(
    { queue: USER_DELETED_QUEUE, pattern: EVENT_TYPES.UserDeleted },
    // Errores pasajeros: reintento con backoff antes de .dead (con ALERTA en el log).
    withRetry(withValidPayload(isUserDeleted, event => handlers.eraseUserProfile(event.eventId, String(event.payload.userId)))),
  );
};
