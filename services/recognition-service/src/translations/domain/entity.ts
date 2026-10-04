export const TRANSLATION_TYPES = ['texto_sena', 'sena_texto', 'voz_sena'] as const;
export type TranslationType = (typeof TRANSLATION_TYPES)[number];

export interface Translation {
  translationId: number;
  userId: number | null;
  inputText: string;
  outputText: string;
  type: TranslationType;
  confidence: number | null;
  source: string | null;
  isDeleted: boolean;
  createdAt: Date;
}

export interface NewTranslation {
  userId: number | null;
  inputText: string;
  outputText: string;
  type: TranslationType;
  confidence?: number | null;
  source?: string | null;
}
