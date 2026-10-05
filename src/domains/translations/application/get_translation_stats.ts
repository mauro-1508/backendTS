import { TranslationStatsRepository } from '../ports/outbound/translation_stats_repository';
import { PermissionChecker } from '../ports/outbound/permission_checker';
import { PermissionDeniedError, translationStatsDomain, TranslationStats } from '../domain/stats';

export const STATS_READ = 'stats.read';

export const makeGetTranslationStats = (deps: {
  statsRepository: TranslationStatsRepository;
  permissionChecker: PermissionChecker;
  now?: () => Date;
}) =>
  async (input: { userId: number }): Promise<TranslationStats> => {
    if (!(await deps.permissionChecker.hasPermission(input.userId, STATS_READ))) {
      throw new PermissionDeniedError('Permiso insuficiente');
    }
    const now = (deps.now ?? (() => new Date()))();
    const raw = await deps.statsRepository.getStats(translationStatsDomain.window(now));
    return translationStatsDomain.build(raw, now);
  };
