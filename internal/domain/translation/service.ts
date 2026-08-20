import { TRANSLATION_TYPES, TranslationType } from './entity';

export class InvalidTranslationError extends Error {}

export const translationDomainService = {
  ensureIsValid({
    outputText,
    type,
    confidence,
  }: {
    outputText?: string;
    type?: string;
    confidence?: number | null;
  }): void {
    if (!outputText || typeof outputText !== 'string' || !outputText.trim()) {
      throw new InvalidTranslationError('outputText es obligatorio');
    }
    if (!type || !TRANSLATION_TYPES.includes(type as TranslationType)) {
      throw new InvalidTranslationError(`type invalido. Valores permitidos: ${TRANSLATION_TYPES.join(', ')}`);
    }
    if (confidence != null && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
      throw new InvalidTranslationError('confidence debe ser un numero entre 0 y 1');
    }
  },

  resolveInputText(inputText: string | undefined, outputText: string): string {
    return (inputText && String(inputText).trim()) || outputText.trim();
  },

  normalizeListParams({ limit, offset }: { limit?: number | string; offset?: number | string }) {
    return {
      limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
      offset: Math.max(Number(offset) || 0, 0),
    };
  },
};
