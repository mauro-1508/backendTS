import { LexiconRepository } from '../domain/repository';
import { normalizeCode, SignNotFoundError } from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';

/**
 * Una seña no se borra: el historial de traducciones la referencia. Retirarla
 * es pasarla a INACTIVE, lo que la oculta del catálogo.
 */
export const makeDeactivateSign = (deps: { lexiconRepository: LexiconRepository }) =>
  async ({ code, userId }: { code: string; userId: number | null }): Promise<LexiconResult> => {
    const updated = await deps.lexiconRepository.setStatus(normalizeCode(code), 'INACTIVE', userId);
    if (!updated) throw new SignNotFoundError(code);
    return { success: true, message: 'Seña retirada del catálogo', data: { code: updated.code, status: updated.status } };
  };
