import { Pool } from 'pg';
import { RequestHandler } from 'express';
import { EventPublisher } from '@traduce/shared';
import { makePostgresTranslationRepository } from './adapters/outbound/postgres/translation_repository';
import { makePostgresTranslationStatsRepository } from './adapters/outbound/postgres/translation_stats_repository';
import { makePostgresMyStatsRepository } from './adapters/outbound/postgres/my_stats_repository';
import { makeCreateTranslation } from './application/create_translation';
import { makeListTranslations } from './application/list_translations';
import { makeDeleteTranslation } from './application/delete_translation';
import { makeGetTranslationStats } from './application/get_translation_stats';
import { makeGetMyTranslationStats } from './application/get_my_translation_stats';
import { makeTranslationRoutes } from './adapters/inbound/http/routes';
import { TranslationService } from './ports/inbound/translation_service';

export const makeTranslationsModule = (deps: {
  pool: Pool;
  eventPublisher: EventPublisher;
  authMiddleware: RequestHandler;
}) => {
  const translationRepository = makePostgresTranslationRepository(deps.pool);
  const translationService: TranslationService = {
    create: makeCreateTranslation({ translationRepository, eventPublisher: deps.eventPublisher }),
    list: makeListTranslations({ translationRepository }),
    getStats: makeGetTranslationStats({ statsRepository: makePostgresTranslationStatsRepository(deps.pool) }),
    getMyStats: makeGetMyTranslationStats({ myStatsRepository: makePostgresMyStatsRepository(deps.pool) }),
    remove: makeDeleteTranslation({ translationRepository }),
  };

  return {
    translationService,
    router: makeTranslationRoutes({ translationService, authMiddleware: deps.authMiddleware }),
  };
};
