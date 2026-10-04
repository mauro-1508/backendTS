import { EventPublisher } from '@traduce/shared';
import { TranslationRepository } from '../ports/outbound/translation_repository';
import { translationDomainService } from '../domain/service';
import { Translation, TranslationType } from '../domain/entity';
import { TranslationResult } from '../ports/inbound/translation_service';

export const TRANSLATION_PRODUCED_EVENT = 'recognition.TranslationProduced';

/** Contrato del evento: texto y glosa; nunca el video ni los landmarks. */
export interface TranslationProducedPayload {
  translationId: number;
  userId: number | null;
  gloss: string;
  text: string;
  occurredAt: string;
}

const toEventPayload = (translation: Translation): TranslationProducedPayload => ({
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
  // La traduccion ya esta guardada: un fallo del bus no debe tumbar la peticion.
  const announce = async (translation: Translation): Promise<void> => {
    try {
      await deps.eventPublisher.publish(TRANSLATION_PRODUCED_EVENT, toEventPayload(translation));
    } catch (error) {
      console.error(`[recognition] no se pudo publicar ${TRANSLATION_PRODUCED_EVENT}`, error);
    }
  };

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
    await announce(created);

    return { success: true, message: 'Traduccion guardada', data: created };
  };
};
