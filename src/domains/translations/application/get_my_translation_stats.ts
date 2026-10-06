import { MyStatsRepository } from '../ports/outbound/my_stats_repository';
import { MyStats, myStatsDomain } from '../domain/my_stats';

export const makeGetMyTranslationStats = (deps: { myStatsRepository: MyStatsRepository }) =>
  async (input: { userId: number }): Promise<MyStats> =>
    myStatsDomain.build(await deps.myStatsRepository.getMyStats(input.userId));
