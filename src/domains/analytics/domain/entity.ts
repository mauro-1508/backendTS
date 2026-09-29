export const USAGE_SECTIONS = [
  'HOME', 'TRANSLATION', 'ALPHABET', 'LEXICON', 'HISTORY',
  'PROFILE', 'SETTINGS', 'NOTIFICATIONS', 'ACHIEVEMENTS', 'ADMIN',
] as const;

export const USAGE_EVENT_TYPES = [
  'SECTION_VIEW', 'TRANSLATION_STARTED', 'TRANSLATION_COMPLETED', 'TRANSLATION_FAILED', 'AUDIO_PLAYED',
  'SIGN_VIEWED', 'SEARCH_PERFORMED', 'HISTORY_ENTRY_DELETED', 'PREFERENCE_CHANGED', 'NOTIFICATION_OPENED',
] as const;

/** Catalogo reference_entity (Docs/06-data/traduce_senas.dbml, modeling-conventions.md). */
export const REFERENCE_TYPES = ['TRANSLATION', 'SIGN', 'CATEGORY', 'ACHIEVEMENT', 'NOTIFICATION', 'AI_MODEL', 'USER'] as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[number];
export type UsageSection = (typeof USAGE_SECTIONS)[number];
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export interface NewUsageEvent {
  userId: number | null;
  sessionId: number | null;
  section: UsageSection;
  eventType: UsageEventType;
  referenceType: string | null;
  referenceId: number | null;
}

export interface UsageEvent extends NewUsageEvent {
  usageEventId: number;
  createdAt: string;
}

/** Fila agregada: solo conteos, nunca datos individuales (INV-012). */
export interface SectionReportRow {
  section: UsageSection;
  visits: number;
}
