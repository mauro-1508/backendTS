import type { UserRegistered } from '@traduce/shared';

/** Eventos que profile consume y publica (routing keys `<servicio>.<Evento>`). */
export const CONSUMED_EVENTS = {
  UserRegistered: 'iam.UserRegistered',
  TranslationProduced: 'recognition.TranslationProduced',
} as const;

export const PUBLISHED_EVENTS = {
  AchievementUnlocked: 'profile.AchievementUnlocked',
  PreferencesChanged: 'profile.PreferencesChanged',
} as const;

/** Contrato compartido, con el identificador normalizado a texto en Profile. */
export type UserRegisteredPayload = Omit<UserRegistered, 'userId'> & {
  userId: string;
};

export interface AchievementUnlockedPayload {
  userId: string;
  achievementId: string;
  code: string;
  points: number;
}
