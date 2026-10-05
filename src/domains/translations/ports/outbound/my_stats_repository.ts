import { MyStatsRaw } from '../../domain/my_stats';

export interface MyStatsRepository {
  /** Solo traducciones del usuario y no borradas. */
  getMyStats(userId: number): Promise<MyStatsRaw>;
}
