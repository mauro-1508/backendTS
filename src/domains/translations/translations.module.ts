import { RequestHandler } from 'express';
import { postgresTranslationRepository } from './adapters/outbound/postgres/translation_repository';
import { makeCreateTranslation } from './application/create_translation';
import { makeListTranslations } from './application/list_translations';
import { makeDeleteTranslation } from './application/delete_translation';
import { postgresTranslationStatsRepository } from './adapters/outbound/postgres/translation_stats_repository';
import { makeGetTranslationStats } from './application/get_translation_stats';
import { postgresMyStatsRepository } from './adapters/outbound/postgres/my_stats_repository';
import { makeGetMyTranslationStats } from './application/get_my_translation_stats';
import { PermissionChecker } from './ports/outbound/permission_checker';
import { makeTranslationRoutes } from './adapters/inbound/http/routes';
import { TranslationService } from './ports/inbound/translation_service';

export const makeTranslationsModule = (deps: { authMiddleware: RequestHandler; permissionChecker: PermissionChecker }) => {
  const repoDeps = { translationRepository: postgresTranslationRepository };
  const translationService: TranslationService = {
    create: makeCreateTranslation(repoDeps),
    list: makeListTranslations(repoDeps),
    remove: makeDeleteTranslation(repoDeps),
    getMyStats: makeGetMyTranslationStats({ myStatsRepository: postgresMyStatsRepository }),
    getStats: makeGetTranslationStats({
      statsRepository: postgresTranslationStatsRepository,
      permissionChecker: deps.permissionChecker,
    }),
  };

  return {
    translationService,
    router: makeTranslationRoutes({ translationService, authMiddleware: deps.authMiddleware }),
  };
};
