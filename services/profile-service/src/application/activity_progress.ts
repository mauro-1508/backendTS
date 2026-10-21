import { ACHIEVEMENT_NOTIFICATION_TYPE_CODE } from '../domain/notification';
import { ActivityState } from '../domain/activity';
import { AchievementMetric, AchievementProgress, advanceProgress, isObtainable, isUnlocked } from '../domain/achievement';
import { DEFAULT_PREFERENCES } from '../domain/preferences';
import { TransactionalRepositories } from '../ports/repositories';
import { achievementNotificationText } from './achievement_notification_text';

export const updateActivityProgress = async (repos: TransactionalRepositories, userId: string, state: ActivityState) => {
  const measurements: Partial<Record<AchievementMetric, number>> = {
    ACTIVE_SECONDS: state.activeSeconds, VOICE_COMPLETED: state.voice,
    FAVORITE_WORD: Math.max(0, ...Object.values(state.words)), DISTINCT_WORDS: Object.keys(state.words).length,
    LETTERS_VIEWED: state.letters.length, BOTH_MODES: Math.min(state.modes.letters, state.modes.words),
    TRANSLATION_DAYS: state.days.length, WORD_CATEGORIES: state.categories.length,
  };
  const unlocked: AchievementProgress[] = [];
  const preferences = await repos.profiles.findPreferences(userId) ?? DEFAULT_PREFERENCES;
  for (const [metric, count] of Object.entries(measurements)) {
    for (const progress of await repos.achievements.findProgressByMetric(userId, metric as AchievementMetric)) {
      if (!isObtainable(progress.achievement) || isUnlocked(progress) || count <= progress.currentCount) continue;
      const next = advanceProgress(progress, count - progress.currentCount, new Date());
      await repos.achievements.saveProgress(userId, next);
      if (!isUnlocked(next)) continue;
      unlocked.push(next);
      if (preferences.notificationsEnabled && await repos.notifications.create({ userId, typeCode: ACHIEVEMENT_NOTIFICATION_TYPE_CODE,
        ...achievementNotificationText(next.achievement, preferences.uiLanguage), referenceType: 'ACHIEVEMENT', referenceId: next.achievement.id })) {
        await repos.achievements.markNotified(userId, next.achievement.id);
      }
    }
  }
  return unlocked;
};
