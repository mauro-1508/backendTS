import { EventPublisher } from '@traduce/shared';
import { LEXICON_EVENTS, SignPublishedPayload } from '../domain/events';
import { LexiconRepository } from '../domain/repository';
import { LexiconValidationError, normalizeCode, SignNotFoundError } from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';
import { publishQuietly } from './publish_event';

/** DRAFT -> ACTIVE. Sin nombre en español no hay nada que mostrar al público. */
export const makePublishSign = (deps: { lexiconRepository: LexiconRepository; eventPublisher: EventPublisher }) =>
  async ({ code, userId }: { code: string; userId: number | null }): Promise<LexiconResult> => {
    const normalized = normalizeCode(code);
    const sign = await deps.lexiconRepository.findByCode(normalized, { includeInactive: true });
    if (!sign) throw new SignNotFoundError(code);
    if (!sign.localizations?.some(l => l.uiLanguage === 'ES' && l.name.trim())) {
      throw new LexiconValidationError('No se puede publicar una seña sin nombre en español');
    }
    const published = await deps.lexiconRepository.setStatus(normalized, 'ACTIVE', userId);
    if (!published) throw new SignNotFoundError(code);
    const payload: SignPublishedPayload = {
      lexiconId: published.lexiconId,
      code: published.code,
      type: published.type,
      language: published.language,
      letter: published.letter,
      categoryId: published.categoryId,
    };
    await publishQuietly(deps.eventPublisher, LEXICON_EVENTS.SignPublished, payload);
    return { success: true, message: 'Seña publicada', data: published };
  };
