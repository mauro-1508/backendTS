import { RequestHandler } from 'express';
import { postgresTranslationRepository } from './adapters/outbound/postgres/translation_repository';
import { makeCreateTranslation } from './application/create_translation';
import { makeListTranslations } from './application/list_translations';
import { makeDeleteTranslation } from './application/delete_translation';
import { makeTranslationRoutes } from './adapters/inbound/http/routes';
import { TranslationService } from './ports/inbound/translation_service';

export const makeTranslationsModule = (deps: { authMiddleware: RequestHandler }) => {
  const repoDeps = { translationRepository: postgresTranslationRepository };
  const translationService: TranslationService = {
    create: makeCreateTranslation(repoDeps),
    list: makeListTranslations(repoDeps),
    remove: makeDeleteTranslation(repoDeps),
  };

  return {
    translationService,
    router: makeTranslationRoutes({ translationService, authMiddleware: deps.authMiddleware }),
  };
};
