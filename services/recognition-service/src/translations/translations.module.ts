import { Pool } from 'pg';
import { RequestHandler } from 'express';
import { EventPublisher } from '@traduce/shared';
import { makePostgresTranslationRepository } from './adapters/outbound/postgres/translation_repository';
import { makeCreateTranslation } from './application/create_translation';
import { makeListTranslations } from './application/list_translations';
import { makeDeleteTranslation } from './application/delete_translation';
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
    remove: makeDeleteTranslation({ translationRepository }),
  };

  return {
    translationService,
    router: makeTranslationRoutes({ translationService, authMiddleware: deps.authMiddleware }),
  };
};
