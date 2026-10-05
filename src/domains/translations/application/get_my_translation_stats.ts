import { MyStatsRepository } from '../ports/outbound/my_stats_repository';
import { MyStats, myStatsDomain } from '../domain/my_stats';

export const makeGetMyTranslationStats = (deps: { myStatsRepository: MyStatsRepository; now?: () => Date }) =>
  async (input: { userId: number }): Promise<MyStats> => {
    const now = (deps.now ?? (() => new Date()))();
    return myStatsDomain.build(await deps.myStatsRepository.getMyStats(input.userId), now);
  };
