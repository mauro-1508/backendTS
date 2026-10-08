import { EventPublisher } from '@traduce/shared';
import { advanceProgress, AchievementMetric, AchievementProgress, isUnlocked } from '../domain/achievement';
import { AchievementUnlockedPayload, PUBLISHED_EVENTS } from '../domain/events';
import { ACHIEVEMENT_NOTIFICATION_TYPE_CODE } from '../domain/notification';
import { DEFAULT_PREFERENCES } from '../domain/preferences';
import { TransactionalRepositories, UnitOfWork } from '../ports/repositories';
import { processEventOnce } from './process_event_once';
import { publishQuietly } from './publish_event';



const TRANSLATIONS_METRIC: AchievementMetric = 'TRANSLATIONS_COMPLETED';
const TRANSLATION_INCREMENT = 1;

const notifyUnlock = (repositories: TransactionalRepositories, userId: string, unlocked: AchievementProgress) =>
  repositories.notifications.create({
    userId,
    typeCode: ACHIEVEMENT_NOTIFICATION_TYPE_CODE,
    title: `Logro desbloqueado: ${unlocked.achievement.name}`,
    body: unlocked.achievement.description,
    referenceType: 'ACHIEVEMENT',
    referenceId: unlocked.achievement.id,
  });

/**
 * Cuenta una traduccion y desbloquea los logros que alcancen su meta. El logro se
 * desbloquea siempre; la notificacion solo si el usuario la tiene activada (ERF8.2).
 */
export const makeRecordTranslation = (deps: { unitOfWork: UnitOfWork; eventPublisher: EventPublisher }) => {
  const applyTranslation = async (repositories: TransactionalRepositories, userId: string) => {
    await repositories.gamificationLocks.lockUser(userId);
    const preferences = (await repositories.profiles.findPreferences(userId)) ?? DEFAULT_PREFERENCES;
    const pending = (await repositories.achievements.findProgressByMetric(userId, TRANSLATIONS_METRIC))
      .filter(progress => !isUnlocked(progress));
    const unlockedNow: AchievementProgress[] = [];

    for (const progress of pending) {
      const next = advanceProgress(progress, TRANSLATION_INCREMENT, new Date());
      await repositories.achievements.saveProgress(userId, next);
      if (!isUnlocked(next)) continue;
      unlockedNow.push(next);
      if (preferences.notificationsEnabled) await notifyUnlock(repositories, userId, next);
    }
    return unlockedNow;
  };

  return async (eventId: string, userId: string): Promise<AchievementProgress[]> => {
    const unlocked = (await processEventOnce(deps.unitOfWork, eventId, repos => applyTranslation(repos, userId))) ?? [];
    for (const { achievement } of unlocked) {
      const payload: AchievementUnlockedPayload = {
        userId, achievementId: achievement.id, code: achievement.code, points: achievement.points,
      };
      await publishQuietly(deps.eventPublisher, PUBLISHED_EVENTS.AchievementUnlocked, payload);
    }
    return unlocked;
  };
};
