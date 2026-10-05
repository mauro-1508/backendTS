import { UserStats } from '../../domain/stats';

export interface UserStatsRepository {
  getStats(): Promise<UserStats>;
}
