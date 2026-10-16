import { EVENT_TYPES, EventSubscriber, subscribeWithRetry, withRetry } from '@traduce/shared';
import { UsageEventRepository } from '../../../domain/repository';
import { makeEraseUserLink } from '../../../application/erase_user_link';
import { makeIngestTranslationProduced, makeIngestUserRegistered } from '../../../application/ingest_events';

export const TRANSLATION_PRODUCED_QUEUE = 'analytics-service.translation-produced';
export const USER_REGISTERED_QUEUE = 'analytics-service.user-registered';
export const USER_DELETED_QUEUE = 'analytics-service.user-deleted';

/**
 * Una cola por evento consumido: si dos handlers compartieran cola, RabbitMQ repartiria
 * los mensajes entre ellos y cada evento podria llegar al handler equivocado.
 * No rechaza: si el broker aun no esta arriba reintenta en segundo plano con backoff.
 */
export const subscribeToDomainEvents = async (deps: {
  subscriber: EventSubscriber;
  repository: UsageEventRepository;
}): Promise<void> => {
  const { subscriber, repository } = deps;
  await Promise.all([
    subscribeWithRetry(
      subscriber,
      { queue: TRANSLATION_PRODUCED_QUEUE, pattern: EVENT_TYPES.TranslationProduced },
      makeIngestTranslationProduced({ repository }),
    ),
    subscribeWithRetry(
      subscriber,
      { queue: USER_REGISTERED_QUEUE, pattern: EVENT_TYPES.UserRegistered },
      makeIngestUserRegistered({ repository }),
    ),
    subscribeWithRetry(
      subscriber,
      { queue: USER_DELETED_QUEUE, pattern: EVENT_TYPES.UserDeleted },
      // Errores pasajeros: reintento con backoff antes de .dead (con ALERTA en el log).
      withRetry(makeEraseUserLink({ repository })),
    ),
  ]);
};
