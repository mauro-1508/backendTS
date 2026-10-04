import { LexiconRepository } from '../domain/repository';
import { LexiconValidationError, normalizeCode, SignNotFoundError } from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';

/** DRAFT -> ACTIVE. Sin nombre en español no hay nada que mostrar al público. */
export const makePublishSign = (deps: { lexiconRepository: LexiconRepository }) =>
  async ({ code, userId }: { code: string; userId: number | null }): Promise<LexiconResult> => {
    const normalized = normalizeCode(code);
    const sign = await deps.lexiconRepository.findByCode(normalized, { includeInactive: true });
    if (!sign) throw new SignNotFoundError(code);
    if (!sign.localizations?.some(l => l.uiLanguage === 'ES' && l.name.trim())) {
      throw new LexiconValidationError('No se puede publicar una seña sin nombre en español');
    }
    const published = await deps.lexiconRepository.setStatus(normalized, 'ACTIVE', userId);
    if (!published) throw new SignNotFoundError(code);
    return { success: true, message: 'Seña publicada', data: published };
  };
