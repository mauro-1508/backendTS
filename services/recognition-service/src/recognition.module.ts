import { Express } from 'express';
import { EventPublisher, EventSubscriber } from '@traduce/shared';
import { makeRecognitionApp, RecognitionAppDeps } from './app';
import { makeAccountsModule } from './accounts/accounts.module';
import { subscribeToUserDeleted } from './accounts/adapters/inbound/events/user_deleted_subscriber';
import { subscribeToLexiconEvents } from './ia/adapters/inbound/events/lexicon_events_subscriber';
import { makeUnlinkUserSamples } from './samples/application/unlink_user_samples';
import { makePostgresTranslationRepository } from './translations/adapters/outbound/postgres/translation_repository';
import { makeEraseUserTranslations } from './translations/application/erase_user_translations';
import { makePurgeExpiredTranslations } from './translations/application/purge_expired_translations';

/** Composición: único lugar donde se eligen las implementaciones concretas y se comparten entre módulos. */
export const makeRecognitionModule = (
  deps: Omit<RecognitionAppDeps, 'eventPublisher' | 'translationRepository'> & {
    eventBus: EventPublisher & EventSubscriber;
    /** 0 = las traducciones no se borran. */
    translationRetentionDays: number;
  },
): { app: Express; subscribe: () => void; jobs: { purgeExpiredTranslations?: () => Promise<number> } } => {
  // Un solo repositorio de traducciones: lo usan las rutas HTTP y la limpieza de cuenta.
  const translationRepository = makePostgresTranslationRepository(deps.pool);

  const app = makeRecognitionApp({
    pool: deps.pool,
    eventPublisher: deps.eventBus,
    sampleRepository: deps.sampleRepository,
    authMiddleware: deps.authMiddleware,
    requireAdmin: deps.requireAdmin,
    translationRepository,
  });

  const accounts = makeAccountsModule({
    eraseTranslations: makeEraseUserTranslations({ translationRepository }),
    unlinkSamples: makeUnlinkUserSamples({ sampleRepository: deps.sampleRepository }),
  });

  return {
    app,
    jobs: {
      purgeExpiredTranslations: deps.translationRetentionDays > 0
        ? makePurgeExpiredTranslations({ translationRepository, retentionDays: deps.translationRetentionDays })
        : undefined,
    },
    // El broker puede tardar en estar arriba: subscribeWithRetry reintenta sin bloquear el arranque.
    subscribe: () => {
      void subscribeToLexiconEvents(deps.eventBus);
      void subscribeToUserDeleted(deps.eventBus, accounts.userDeletedHandler);
    },
  };
};
