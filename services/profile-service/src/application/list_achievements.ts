import { AchievementProgress, concealIfSecret, isObtainable } from '../domain/achievement';
import { AchievementRepository } from '../ports/repositories';

/** Availability is independent of progress: null means no measurement exists. */
export const serializeAchievement = (progress: AchievementProgress) => {
  const hidden = concealIfSecret(progress);
  const available = hidden.achievement.availability !== 'upcoming';
  return {
    ...hidden,
    achievement: {
      ...hidden.achievement,
      collection: hidden.achievement.collection ?? 'legacy',
      availability: available ? 'available' as const : 'upcoming' as const,
      category: hidden.achievement.category ?? null,
      level: hidden.achievement.level ?? null,
      localizations: hidden.achievement.isSecret && hidden.achievedAt === null
        ? {} : hidden.achievement.localizations ?? {},
      targetCount: available ? hidden.achievement.targetCount : null,
    },
    currentCount: available ? hidden.currentCount : null,
    achievedAt: available ? hidden.achievedAt : null,
  };
};

/** Keep the measured-only v1 wire shape stable for clients that do not opt in. */
export const serializeLegacyAchievement = (progress: AchievementProgress) => {
  const hidden = concealIfSecret(progress);
  const { collection, availability, category, level, localizations, ...achievement } = hidden.achievement;
  return { ...hidden, achievement };
};

export const makeListAchievements = (deps: { achievements: AchievementRepository }) =>
  async (userId: string, catalogVersion: 1 | 2 = 1) => {
    const progress = (await deps.achievements.findAllProgress(userId, catalogVersion))
      .filter(p => isObtainable(p.achievement))
      .sort((a, b) => Number((a.achievement.collection ?? 'legacy') !== 'legacy')
        - Number((b.achievement.collection ?? 'legacy') !== 'legacy')
        || a.achievement.targetCount - b.achievement.targetCount
        || a.achievement.code.localeCompare(b.achievement.code));
    // Defensive filtering also protects alternative repository implementations.
    return catalogVersion === 2 ? progress.map(serializeAchievement)
      : progress.map(serializeLegacyAchievement);
  };
