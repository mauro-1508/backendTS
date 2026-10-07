import { LexiconRepository } from '../domain/repository';
import { DEFAULT_LANGUAGE } from '../domain/entity';
import { parseUiLanguage } from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';

/** RF7: el alfabeto es el subconjunto LETTER del léxico, en orden (Ñ después de N). */
export const makeGetAlphabet = (deps: { lexiconRepository: LexiconRepository }) =>
  async (input: { language?: string; lang?: string }): Promise<LexiconResult> => {
    const items = await deps.lexiconRepository.list({
      type: 'LETTER',
      language: (input.language ?? DEFAULT_LANGUAGE).toUpperCase(),
      lang: parseUiLanguage(input.lang),
    });
    return { success: true, data: items };
  };
