import { TranslationStats } from '../../domain/stats';
import { MyStats } from '../../domain/my_stats';

export interface TranslationResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface TranslationService {
  create(input: {
    userId: number | null;
    inputText?: string;
    outputText: string;
    type: string;
    confidence?: number | null;
    source?: string | null;
  }): Promise<TranslationResult>;
  list(input: { userId: number | null; limit?: number | string; offset?: number | string }): Promise<TranslationResult>;
  getStats(input: { userId: number; permissions: string[] }): Promise<TranslationStats>;
  getMyStats(input: { userId: number }): Promise<MyStats>;
  remove(input: { translationId: number; userId: number }): Promise<TranslationResult>;
}
