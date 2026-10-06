import { PERMISSIONS } from '@traduce/shared';
import { TranslationStatsRepository } from '../ports/outbound/translation_stats_repository';
import { PermissionDeniedError, translationStatsDomain, TranslationStats } from '../domain/stats';

export const STATS_READ = PERMISSIONS.STATS_READ;

/** `permissions` son los del JWT del solicitante (los firma iam). */
export const makeGetTranslationStats = (deps: {
  statsRepository: TranslationStatsRepository;
  now?: () => Date;
}) =>
  async (input: { userId: number; permissions: string[] }): Promise<TranslationStats> => {
    if (!input.permissions.includes(STATS_READ)) {
      throw new PermissionDeniedError('Permiso insuficiente');
    }
    const now = (deps.now ?? (() => new Date()))();
    const raw = await deps.statsRepository.getStats(translationStatsDomain.window(now));
    return translationStatsDomain.build(raw, now);
  };
