import { TranslationProduced } from '@traduce/shared';
import { normalizeWord, RECOGNIZABLE_WORDS, WORD_CATEGORIES } from '../domain/translation_vocabulary';
import { updateActivityProgress } from './activity_progress';
import { EventPublisher } from '@traduce/shared';
import { advanceProgress, AchievementMetric, AchievementProgress, isUnlocked, isObtainable } from '../domain/achievement';
import { AchievementUnlockedPayload, PUBLISHED_EVENTS } from '../domain/events';
import { ACHIEVEMENT_NOTIFICATION_TYPE_CODE } from '../domain/notification';
import { achievementNotificationText } from './achievement_notification_text';
import { DEFAULT_PREFERENCES, UiLanguage } from '../domain/preferences';
import { TransactionalRepositories, UnitOfWork } from '../ports/repositories';
import { processEventOnce } from './process_event_once';
import { publishQuietly } from './publish_event';

const TRANSLATIONS_METRIC: AchievementMetric = 'TRANSLATIONS_COMPLETED';
const TRANSLATION_INCREMENT = 1;

const notifyUnlock = (repositories: TransactionalRepositories, userId: string, unlocked: AchievementProgress, language: UiLanguage) =>
  repositories.notifications.create({
    userId,
    typeCode: ACHIEVEMENT_NOTIFICATION_TYPE_CODE,
    ...achievementNotificationText(unlocked.achievement, language),
    referenceType: 'ACHIEVEMENT',
    referenceId: unlocked.achievement.id,
  });

/**
 * Cuenta una traduccion y desbloquea los logros que alcancen su meta. El logro se
 * desbloquea siempre; la notificacion solo si el usuario la tiene activada (ERF8.2).
 */
export const makeRecordTranslation = (deps: { unitOfWork: UnitOfWork; eventPublisher: EventPublisher }) => {
  const applyTranslation = async (repositories: TransactionalRepositories, userId: string, event?: TranslationProduced) => {
    await repositories.gamificationLocks.lockUser(userId);
    // Una traduccion tardia de una cuenta borrada no recrea logros ni notificaciones.
    if (await repositories.profiles.isErased(userId)) return [];
    if (event && repositories.activity && !await repositories.activity.recordTranslationIfNew(userId, event.translationId)) return [];
    const preferences = (await repositories.profiles.findPreferences(userId)) ?? DEFAULT_PREFERENCES;
    const pending = (await repositories.achievements.findProgressByMetric(userId, TRANSLATIONS_METRIC))
      .filter(progress => isObtainable(progress.achievement) && !isUnlocked(progress));
    const unlockedNow: AchievementProgress[] = [];

    for (const progress of pending) {
      const next = advanceProgress(progress, TRANSLATION_INCREMENT, new Date());
      await repositories.achievements.saveProgress(userId, next);
      if (!isUnlocked(next)) continue;
      unlockedNow.push(next);
      if (preferences.notificationsEnabled) {
        const notificationCreated = await notifyUnlock(repositories, userId, next, preferences.uiLanguage);
        if (notificationCreated) {
          await repositories.achievements.markNotified(userId, next.achievement.id);
        }
      }
    }
    if (event?.eligible === true && repositories.activity) {
      const state = await repositories.activity.load(userId);
      // Deduplicate semantic identity too: retries may arrive in a new event envelope.
      if (!state.translations.includes(event.translationId)) {
        // Only recent translation IDs are needed by the on-screen voice button.
        // Durable semantic deduplication lives in the separate receipt table.
        state.translations = [...state.translations, event.translationId].slice(-50);
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(event.occurredAt));
        if (!state.days.includes(day) && state.days.length < 5) state.days.push(day);
        if (event.mode === 'letters' || event.mode === 'words') state.modes[event.mode] = Math.min(10, state.modes[event.mode] + 1);
        const word = normalizeWord(event.text);
        if (event.mode === 'words' && RECOGNIZABLE_WORDS.has(word)) {
          state.words[word] = Math.min(50, (state.words[word] ?? 0) + 1);
          const category = WORD_CATEGORIES[word];
          if (category && !state.categories.includes(category)) state.categories.push(category);
        }
        if (event.sessionId) {
          if (state.session !== event.sessionId) state.lastTick = undefined;
          state.session = event.sessionId;
          // Old queued events cannot establish live activity.
          state.confirmedAt = Math.min(Date.now(), Date.parse(event.occurredAt));
        }
        await repositories.activity.save(userId, state);
        unlockedNow.push(...await updateActivityProgress(repositories, userId, state));
      }
    }
    return unlockedNow;
  };

  return async (eventId: string, userId: string, event?: TranslationProduced): Promise<AchievementProgress[]> => {
    if (event?.eligible === false) return [];
    const unlocked = (await processEventOnce(deps.unitOfWork, eventId, repos => applyTranslation(repos, userId, event))) ?? [];
    for (const { achievement } of unlocked) {
      const payload: AchievementUnlockedPayload = {
        userId, achievementId: achievement.id, code: achievement.code, points: achievement.points,
      };
      await publishQuietly(deps.eventPublisher, PUBLISHED_EVENTS.AchievementUnlocked, payload);
    }
    return unlocked;
  };
};
