import { TranslationStats } from '../../domain/stats';
import { MyStats } from '../../domain/my_stats';
import { Translation } from '../../domain/entity';

export interface TranslationService {
  create(input: {
    userId: number | null;
    inputText?: string;
    outputText: string;
    type: string;
    confidence?: number | null;
    source?: string | null;
    eligible?: boolean;
    mode?: 'letters' | 'words';
    sessionId?: string;
  }): Promise<Translation>;
  list(input: { userId: number | null; limit?: number | string; offset?: number | string }): Promise<Translation[]>;
  getStats(input: { userId: number; permissions: string[] }): Promise<TranslationStats>;
  getMyStats(input: { userId: number }): Promise<MyStats>;
  /** Lanza Error si la traduccion no existe. */
  remove(input: { translationId: number; userId: number }): Promise<{ translationId: number }>;
}
