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
  remove(input: { translationId: number; userId: number }): Promise<TranslationResult>;
}
