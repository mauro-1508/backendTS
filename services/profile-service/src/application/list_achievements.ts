import { AchievementProgress, concealIfSecret } from '../domain/achievement';
import { AchievementRepository } from '../ports/repositories';

export const makeListAchievements = (deps: { achievements: AchievementRepository }) =>
  async (userId: string): Promise<AchievementProgress[]> =>
    (await deps.achievements.findAllProgress(userId)).map(concealIfSecret);
