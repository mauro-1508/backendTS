import { UserStatsRepository } from '../ports/outbound/user_stats_repository';
import { PermissionChecker } from '../ports/outbound/permission_checker';
import { PermissionDeniedError, UserStats } from '../domain/stats';

export const STATS_READ = 'stats.read';

export const makeGetUserStats = (deps: { statsRepository: UserStatsRepository; permissionChecker: PermissionChecker }) =>
  async (input: { userId: number }): Promise<UserStats> => {
    if (!(await deps.permissionChecker.hasPermission(input.userId, STATS_READ))) {
      throw new PermissionDeniedError('Permiso insuficiente');
    }
    return deps.statsRepository.getStats();
  };
