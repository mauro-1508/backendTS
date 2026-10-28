import { UiLanguage } from './preferences';

export interface ChallengeDefinition {
  challengeId: string;
  code: string;
  name: string;
  description: string;
  targetCount: number;
  points: number;
  localizations: Partial<Record<Lowercase<UiLanguage>, { name: string; description: string }>>;
}
export interface DailyChallenge extends ChallengeDefinition {
  currentCount: number;
  completed: boolean;
  completedAt: string | null;
  date: string;
}
export interface ChallengeAssignment extends DailyChallenge { assignmentId: string }

/** Fecha calendario de Bogotá, independiente de la zona del proceso. */
export const bogotaDate = (instant: Date): string => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
export const selectChallenge = (definitions: ChallengeDefinition[], date: string): ChallengeDefinition | null => {
  const sorted = [...definitions].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  if (!sorted.length) return null;
  const days = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return sorted[((days % sorted.length) + sorted.length) % sorted.length];
};
export const initialChallenge = (definition: ChallengeDefinition, date: string): DailyChallenge => ({
  ...definition, date, currentCount: 0, completed: false, completedAt: null,
});
export const challengeText = (challenge: ChallengeDefinition, language: UiLanguage) =>
  challenge.localizations[language.toLowerCase() as Lowercase<UiLanguage>]
  ?? challenge.localizations.es ?? { name: challenge.name, description: challenge.description };
