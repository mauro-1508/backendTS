export interface ActivityState {
  translations: number[];
  days: string[];
  words: Record<string, number>;
  categories: string[];
  modes: { letters: number; words: number };
  letters: string[];
  voice: number;
  activeSeconds: number;
  lastTick?: number;
  session?: string;
  confirmedAt?: number;
  playbacks?: Record<string, { id: string; startedAt: number; translationId: number }>;
}
export const emptyActivity = (): ActivityState => ({ translations: [], days: [], words: {}, categories: [],
  modes: { letters: 0, words: 0 }, letters: [], voice: 0, activeSeconds: 0 });
