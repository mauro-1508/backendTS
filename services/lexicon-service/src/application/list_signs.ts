import { SignType } from '../domain/entity';
import { LexiconRepository } from '../domain/repository';
import {
  assertSignStatus, assertSignType, LexiconValidationError, MAX_QUERY_LENGTH, parsePagination, parseUiLanguage,
} from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';

/** Listado y búsqueda (HU-LEX-001/002). Con `q` el repositorio ordena por relevancia. */
export const makeListSigns = (deps: { lexiconRepository: LexiconRepository }) =>
  async (input: {
    type?: string; language?: string; category?: string; q?: string; lang?: string;
    /** Vista admin: incluye DRAFT/INACTIVE y permite filtrar por estado. */
    includeInactive?: boolean; status?: string;
    limit?: unknown; offset?: unknown;
  }): Promise<LexiconResult> => {
    const type: SignType | undefined = input.type ? assertSignType(input.type.toUpperCase()) : undefined;
    const q = input.q?.trim() || undefined;
    if (q && q.length > MAX_QUERY_LENGTH) {
      throw new LexiconValidationError(`q no puede pasar de ${MAX_QUERY_LENGTH} caracteres`);
    }
    const { limit, offset } = parsePagination(input);
    const items = await deps.lexiconRepository.list({
      type,
      language: input.language?.toUpperCase(),
      category: input.category?.trim() || undefined,
      q,
      status: input.status ? assertSignStatus(input.status.toUpperCase()) : undefined,
      includeInactive: input.includeInactive,
      limit,
      offset,
      lang: parseUiLanguage(input.lang),
    });
    if (q && items.length === 0) {
      return { success: true, message: `No se encontraron señas para '${q}'`, data: [], meta: { limit, offset } };
    }
    return { success: true, data: items, meta: { limit, offset } };
  };
