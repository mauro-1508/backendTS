import { emptyActivity, ActivityState } from '../src/domain/activity';
import { AchievementProgress } from '../src/domain/achievement';
import { NewNotification } from '../src/domain/notification';
import { DEFAULT_PREFERENCES, Preferences } from '../src/domain/preferences';
import {NewProfile,TransactionalRepositories,UnitOfWork,} from '../src/ports/repositories';

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
  const activities = new Map<string, ActivityState>();
  const receipts = new Set<string>();
  const progressByUser = new Map<string, Map<string, AchievementProgress>>();
  const preferencesByUser = new Map<string, Preferences>();
    const profilesByUser = new Map<string, NewProfile>();
  const notifications: NewNotification[] = [];
  const notifiedAchievements = new Set<string>();
  const processed = new Set<string>();
  const createdProfiles: string[] = [];
  const erasedUsers = new Set<string>();

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
    activity: {
      recordTranslationIfNew: async (userId, id) => {
        const key = `${userId}:${id}`;
        if (receipts.has(key)) return false;
        receipts.add(key); return true;
      },
      load: async userId => structuredClone(activities.get(userId) ?? emptyActivity()),
      save: async (userId, state) => { activities.set(userId, structuredClone(state)); },
    },
        profiles: {
      createIfAbsent: async profile => {
        if (erasedUsers.has(profile.userId)) return;
        if (!profilesByUser.has(profile.userId)) {
          profilesByUser.set(profile.userId, { ...profile });
          createdProfiles.push(profile.userId);
        }

        if (!preferencesByUser.has(profile.userId)) {
          preferencesByUser.set(profile.userId, { ...DEFAULT_PREFERENCES });
        }
      },
      isErased: async userId => erasedUsers.has(userId),
      eraseUser: async userId => {
        activities.delete(userId);
        for (const key of receipts) if (key.startsWith(`${userId}:`)) receipts.delete(key);
        erasedUsers.add(userId);
        profilesByUser.delete(userId);
        preferencesByUser.delete(userId);
        progressByUser.delete(userId);
        for (const key of notifiedAchievements) {
          if (key.startsWith(`${userId}:`)) notifiedAchievements.delete(key);
        }
        for (let i = notifications.length - 1; i >= 0; i--) {
          if (notifications[i].userId === userId) notifications.splice(i, 1);
        }
      },
      findProfile: async userId => {
        const profile = profilesByUser.get(userId);
        if (!profile) return null;

        return {
          userId,
          fullName: profile.fullName ?? '',
          username: profile.username,
          email: profile.email,
          preferences: {
            ...(preferencesByUser.get(userId) ?? DEFAULT_PREFERENCES),
          },
        };
      },
      findPreferences: async userId => {
        const preferences = preferencesByUser.get(userId);
        return preferences ? { ...preferences } : null;
      },
      updatePreferences: async (userId, patch) => {
        if (!profilesByUser.has(userId)) return null;

        const updated = {
          ...(preferencesByUser.get(userId) ?? DEFAULT_PREFERENCES),
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        preferencesByUser.set(userId, updated);
        return { ...updated };
      },
    },

    achievements: {
      findProgressByMetric: async (userId, metric) =>
        withUserState(userId).filter(
          progress => progress.achievement.metric === metric,
        ),
      findAllProgress: async (userId, version = 1) => withUserState(userId).filter(p => version === 2 || p.achievement.metric === 'TRANSLATIONS_COMPLETED'),
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
    profilesByUser,
    createdProfiles,
    erasedUsers,
    progressOf,
  };
};
