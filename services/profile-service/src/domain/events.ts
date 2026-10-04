/** Eventos que profile consume y publica (routing keys `<servicio>.<Evento>`). */
export const CONSUMED_EVENTS = {
  UserRegistered: 'iam.UserRegistered',
  TranslationProduced: 'recognition.TranslationProduced',
} as const;

export const PUBLISHED_EVENTS = {
  AchievementUnlocked: 'profile.AchievementUnlocked',
  PreferencesChanged: 'profile.PreferencesChanged',
} as const;

export interface UserRegisteredPayload {
  userId: string;
  email?: string;
  fullName?: string;
  username?: string;
}

export interface TranslationProducedPayload {
  userId: string;
}

export interface AchievementUnlockedPayload {
  userId: string;
  achievementId: string;
  code: string;
  points: number;
}
