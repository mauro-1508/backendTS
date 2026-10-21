export type AchievementMetric =
  | 'ACTIVE_SECONDS' | 'VOICE_COMPLETED' | 'FAVORITE_WORD' | 'DISTINCT_WORDS'
  | 'LETTERS_VIEWED' | 'BOTH_MODES' | 'TRANSLATION_DAYS' | 'WORD_CATEGORIES'
  | 'CATALOG_REQUIREMENT'
  | 'TRANSLATIONS_COMPLETED'
  | 'SIGNS_LEARNED'
  | 'ALPHABET_COMPLETED'
  | 'SESSIONS_COMPLETED';

export interface AchievementLocalization {
  name: string;
  description: string;
  unavailableReason?: string;
}

export interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  metric: AchievementMetric;
  targetCount: number;
  points: number;
  iconReference?: string;
  isSecret: boolean;
  isActive: boolean;
  // Optional internally for pre-catalogue fixtures; serialized explicitly by listAchievements.
  collection?: 'catalog' | 'legacy';
  availability?: 'available' | 'upcoming';
  category?: 'translation' | 'practice' | 'vocabulary' | 'consistency' | 'community' | null;
  level?: 'bronze' | 'silver' | 'gold' | null;
  localizations?: Record<string, AchievementLocalization>;
}

/** Logro con el avance de un usuario; `achievedAt` nulo = en progreso. */
export interface AchievementProgress {
  achievement: Achievement;
  currentCount: number;
  achievedAt: string | null;
}

export const isUnlocked = (progress: AchievementProgress): boolean => progress.achievedAt !== null;

/**
 * Suma `amount` al avance. Un logro ya desbloqueado no cambia: asi se desbloquea
 * una sola vez aunque lleguen mas eventos.
 */
export const advanceProgress = (progress: AchievementProgress, amount: number, now: Date): AchievementProgress => {
  if (isUnlocked(progress)) return progress;
  const currentCount = progress.currentCount + amount;
  const reachedTarget = currentCount >= progress.achievement.targetCount;
  return { ...progress, currentCount, achievedAt: reachedTarget ? now.toISOString() : null };
};

const HIDDEN_TEXT = '???';

/** Los logros secretos ocultan nombre y descripcion hasta desbloquearse. */
export const concealIfSecret = (progress: AchievementProgress): AchievementProgress =>
  progress.achievement.isSecret && !isUnlocked(progress)
    ? { ...progress, achievement: { ...progress.achievement, name: HIDDEN_TEXT, description: HIDDEN_TEXT } }
    : progress;

/** Only implemented measurements with a positive target can be published. */
export const isObtainable = (achievement: Achievement): boolean =>
  achievement.isActive && ['TRANSLATIONS_COMPLETED','ACTIVE_SECONDS','VOICE_COMPLETED','FAVORITE_WORD','DISTINCT_WORDS','LETTERS_VIEWED','BOTH_MODES','TRANSLATION_DAYS','WORD_CATEGORIES'].includes(achievement.metric)
  && achievement.availability !== 'upcoming' && achievement.code !== 'firstSign'
  && Number.isSafeInteger(achievement.targetCount) && achievement.targetCount > 0;
