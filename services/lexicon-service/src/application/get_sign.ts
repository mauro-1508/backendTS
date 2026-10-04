import { LexiconRepository } from '../domain/repository';
import { normalizeCode, parseUiLanguage, SignNotFoundError } from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';

/** Lectura pública: solo señas ACTIVE. Con `includeInactive` (vista admin), cualquier estado. */
export const makeGetSign = (deps: { lexiconRepository: LexiconRepository }) =>
  async ({ code, lang, includeInactive }: { code: string; lang?: string; includeInactive?: boolean }): Promise<LexiconResult> => {
    const sign = await deps.lexiconRepository.findByCode(normalizeCode(code), { lang: parseUiLanguage(lang), includeInactive });
    if (!sign) throw new SignNotFoundError(code);
    return { success: true, data: sign };
  };
