import { EventSubscriber } from '@traduce/shared';
import { UsageEventRepository } from '../../../domain/repository';
import {
  makeIngestTranslationProduced, makeIngestUserRegistered, TRANSLATION_PRODUCED, USER_REGISTERED,
} from '../../../application/ingest_events';

export const ANALYTICS_QUEUE = 'analytics-service';

/** Una cola propia con un binding por evento consumido. */
export const subscribeToDomainEvents = async (deps: {
  subscriber: EventSubscriber;
  repository: UsageEventRepository;
}): Promise<void> => {
  const { subscriber, repository } = deps;
  await subscriber.subscribe({ queue: ANALYTICS_QUEUE, pattern: TRANSLATION_PRODUCED }, makeIngestTranslationProduced({ repository }));
  await subscriber.subscribe({ queue: ANALYTICS_QUEUE, pattern: USER_REGISTERED }, makeIngestUserRegistered({ repository }));
};
