import { EVENT_TYPES, EventPublisher, publishQuietly, TranslationProduced } from '@traduce/shared';
import { TranslationRepository } from '../ports/outbound/translation_repository';
import { translationDomainService } from '../domain/service';
import { Translation, TranslationType } from '../domain/entity';
import { TranslationResult } from '../ports/inbound/translation_service';

const toEventPayload = (translation: Translation): TranslationProduced => ({
  translationId: translation.translationId,
  userId: translation.userId,
  gloss: translation.inputText,
  text: translation.outputText,
  occurredAt: translation.createdAt.toISOString(),
});

export const makeCreateTranslation = (deps: {
  translationRepository: TranslationRepository;
  eventPublisher: EventPublisher;
}) => {
  return async (input: {
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
    // La traduccion ya esta guardada: un fallo del bus no debe tumbar la peticion.
    await publishQuietly(deps.eventPublisher, EVENT_TYPES.TranslationProduced, toEventPayload(created));

    return { success: true, message: 'Traduccion guardada', data: created };
  };
};
