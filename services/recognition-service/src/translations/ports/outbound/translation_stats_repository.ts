import { StatsRaw, StatsWindow } from '../../domain/stats';

export interface TranslationStatsRepository {
  /** Solo cuenta traducciones no borradas. */
  getStats(window: StatsWindow): Promise<StatsRaw>;
}
