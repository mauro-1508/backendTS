/** Medallas por puntos reales de retos: comparte transacción y bloqueo con su concesión. */
import { AchievementProgress, isObtainable, isUnlocked } from '../domain/achievement';
import { Preferences } from '../domain/preferences';
import { TransactionalRepositories } from '../ports/repositories';
import { achievementNotificationText } from './achievement_notification_text';

export async function updateChallengeRewardAchievements(repos: TransactionalRepositories, userId: string, preferences: Preferences) {
  const total = await repos.challenges.rewardTotal(userId);
  const unlocked: AchievementProgress[] = [];
  for (const progress of await repos.achievements.findProgressByMetric(userId, 'DAILY_CHALLENGE_POINTS')) {
    if (!isObtainable(progress.achievement)) continue;
    const reached = !isUnlocked(progress) && total >= progress.achievement.targetCount;
    // La fecha indica reconocimiento, no una fecha histórica inferida de eventos.
    const next = { ...progress, currentCount: total,
      achievedAt: progress.achievedAt ?? (reached ? new Date().toISOString() : null) };
    await repos.achievements.saveProgress(userId, next);
    if (!reached) continue;
    unlocked.push(next);
    if (preferences.notificationsEnabled && await repos.notifications.create({ userId,
      typeCode: 'ACHIEVEMENT_UNLOCKED', ...achievementNotificationText(next.achievement, preferences.uiLanguage),
      referenceType: 'ACHIEVEMENT', referenceId: next.achievement.id })) {
      await repos.achievements.markNotified(userId, next.achievement.id);
    }
  }
  return unlocked;
}
