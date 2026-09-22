import { TranslationRepository } from '../../ports/outbound/translation_repository';
import { translationDomainService } from '../../domain/translation/service';
import { TranslationType } from '../../domain/translation/entity';
import { TranslationResult } from '../../ports/inbound/translation_service';

export const makeCreateTranslation = (deps: { translationRepository: TranslationRepository }) =>
  async (input: {
    userId: number | null;
    inputText?: string;
    outputText: string;
    type: string;
    confidence?: number | null;
    source?: string | null;
  }): Promise<TranslationResult> => {
    translationDomainService.ensureIsValid(input);

    const created = await deps.translationRepository.create({
      userId: input.userId,
      inputText: translationDomainService.resolveInputText(input.inputText, input.outputText),
      outputText: input.outputText.trim(),
      type: input.type as TranslationType,
      confidence: input.confidence,
      source: input.source,
    });

    return { success: true, message: 'Traduccion guardada', data: created };
  };
