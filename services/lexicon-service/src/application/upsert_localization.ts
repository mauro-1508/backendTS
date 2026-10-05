import { LexiconRepository } from '../domain/repository';
import { normalizeCode, SignNotFoundError, validateLocalization } from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';

export const makeUpsertLocalization = (deps: { lexiconRepository: LexiconRepository }) =>
  async ({ code, uiLanguage, localization }: {
    code: string;
    uiLanguage: string;
    localization: { name?: unknown; meaning?: unknown; description?: unknown };
  }): Promise<LexiconResult> => {
    const valid = validateLocalization({ ...localization, uiLanguage });
    const saved = await deps.lexiconRepository.upsertLocalization(normalizeCode(code), valid);
    if (!saved) throw new SignNotFoundError(code);
    return { success: true, message: 'Localización guardada', data: saved };
  };
