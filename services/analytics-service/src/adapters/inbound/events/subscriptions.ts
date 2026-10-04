import { EventSubscriber } from '@traduce/shared';
import { UsageEventRepository } from '../../../domain/repository';
import {
  makeIngestTranslationProduced, makeIngestUserRegistered, TRANSLATION_PRODUCED, USER_REGISTERED,
} from '../../../application/ingest_events';

export const TRANSLATION_PRODUCED_QUEUE = 'analytics-service.translation-produced';
export const USER_REGISTERED_QUEUE = 'analytics-service.user-registered';

/**
 * Una cola por evento consumido: si dos handlers compartieran cola, RabbitMQ repartiria
 * los mensajes entre ellos y cada evento podria llegar al handler equivocado.
 */
export const subscribeToDomainEvents = async (deps: {
  subscriber: EventSubscriber;
  repository: UsageEventRepository;
}): Promise<void> => {
  const { subscriber, repository } = deps;
  await subscriber.subscribe({ queue: TRANSLATION_PRODUCED_QUEUE, pattern: TRANSLATION_PRODUCED }, makeIngestTranslationProduced({ repository }));
  await subscriber.subscribe({ queue: USER_REGISTERED_QUEUE, pattern: USER_REGISTERED }, makeIngestUserRegistered({ repository }));
};
