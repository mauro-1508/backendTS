import { AchievementProgress } from '../src/domain/achievement';
import { NewNotification } from '../src/domain/notification';
import { DEFAULT_PREFERENCES, Preferences } from '../src/domain/preferences';
import { TransactionalRepositories, UnitOfWork } from '../src/ports/repositories';

export const makeAchievement = (
  code: string,
  targetCount: number,
  isSecret = false,
): AchievementProgress => ({
  achievement: {
    id: `id-${code}`,
    code,
    name: code,
    description: `desc ${code}`,
    metric: 'TRANSLATIONS_COMPLETED',
    targetCount,
    points: 10,
    isSecret,
    isActive: true,
  },
  currentCount: 0,
  achievedAt: null,
});

/** Repositorios en memoria para probar casos de uso sin base de datos. */
export const makeInMemoryStore = (catalog: AchievementProgress[]) => {
  const progressByUser = new Map<string, Map<string, AchievementProgress>>();
  const preferencesByUser = new Map<string, Preferences>();
  const notifications: NewNotification[] = [];
  const notifiedAchievements = new Set<string>();
  const processed = new Set<string>();
  const createdProfiles: string[] = [];

  const progressOf = (userId: string) => {
    if (!progressByUser.has(userId)) {
      progressByUser.set(userId, new Map());
    }

    return progressByUser.get(userId)!;
  };

  const withUserState = (userId: string) =>
    catalog.map(
      entry => progressOf(userId).get(entry.achievement.id) ?? entry,
    );

  const repositories: TransactionalRepositories = {
    profiles: {
      createIfAbsent: async ({ userId }) => {
        if (preferencesByUser.has(userId)) return;

        createdProfiles.push(userId);
        preferencesByUser.set(userId, { ...DEFAULT_PREFERENCES });
      },
      findProfile: async () => null,
      findPreferences: async userId =>
        preferencesByUser.get(userId) ?? null,
      updatePreferences: async () => null,
    },

    achievements: {
      findProgressByMetric: async (userId, metric) =>
        withUserState(userId).filter(
          progress => progress.achievement.metric === metric,
        ),
      findAllProgress: async userId => withUserState(userId),
      saveProgress: async (userId, progress) => {
        progressOf(userId).set(progress.achievement.id, progress);
      },
      markNotified: async (userId, achievementId) => {
        notifiedAchievements.add(`${userId}:${achievementId}`);
      },
    },

    notifications: {
      create: async notification => {
        notifications.push(notification);
        return true;
      },
      list: async () => ({
        items: [],
        total: 0,
        unreadCount: 0,
      }),
      markRead: async () => null,
    },

    processedEvents: {
      markIfNew: async eventId => {
        if (processed.has(eventId)) return false;

        processed.add(eventId);
        return true;
      },
    },

    gamificationLocks: {
      lockUser: async () => {},
    },
  };

  const unitOfWork: UnitOfWork = {
    run: work => work(repositories),
  };

  return {
    repositories,
    unitOfWork,
    notifications,
    notifiedAchievements,
    preferencesByUser,
    createdProfiles,
    progressOf,
  };
};