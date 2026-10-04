export const USAGE_SECTIONS = [
  'HOME', 'TRANSLATION', 'ALPHABET', 'LEXICON', 'HISTORY', 'PROFILE', 'SETTINGS', 'NOTIFICATIONS', 'ACHIEVEMENTS', 'ADMIN',
] as const;
export type UsageSection = (typeof USAGE_SECTIONS)[number];

export const USAGE_EVENT_TYPES = [
  'SECTION_VIEW', 'TRANSLATION_STARTED', 'TRANSLATION_COMPLETED', 'TRANSLATION_FAILED', 'AUDIO_PLAYED',
  'SIGN_VIEWED', 'SEARCH_PERFORMED', 'HISTORY_ENTRY_DELETED', 'PREFERENCE_CHANGED', 'NOTIFICATION_OPENED',
  // Extension del contrato: lo registra el consumidor de iam.UserRegistered (el cliente no lo envia).
  'USER_REGISTERED',
] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export const REFERENCE_TYPES = ['TRANSLATION', 'SIGN', 'CATEGORY', 'ACHIEVEMENT', 'NOTIFICATION', 'AI_MODEL', 'USER'] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

/** Hecho de uso. `eventId` es unico: el del sobre del broker, o uno generado si lo envia el cliente. */
export interface UsageEvent {
  eventId: string;
  userId: string | null;
  sessionId: string | null;
  section: UsageSection;
  eventType: UsageEventType;
  referenceType: ReferenceType | null;
  referenceId: string | null;
  signCodes: string[];
  createdAt: Date;
}

/** Rango de dias calendario (YYYY-MM-DD, ambos inclusivos, hora de Colombia). */
export interface DateRange {
  from: string;
  to: string;
}

export interface UsageSummary {
  translations: number;
  newUsers: number;
}

export interface TopSign {
  signCode: string;
  translations: number;
}

export interface DailyUsage {
  date: string;
  translations: number;
  newUsers: number;
}
