import { NewResource } from '../domain/entity';
import { LexiconRepository } from '../domain/repository';
import {
  normalizeCode, parsePositiveInt, PositionTakenError, SignNotFoundError, validateResource,
} from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';

/** `mediaBaseUrl` (LEXICON_MEDIA_BASE_URL): unico origen absoluto aceptado en `url`. */
export const makeAddResource = (deps: { lexiconRepository: LexiconRepository; mediaBaseUrl?: string }) =>
  async ({ code, resource }: { code: string; resource: NewResource }): Promise<LexiconResult> => {
    const normalized = normalizeCode(code);
    const valid = validateResource(resource, deps.mediaBaseUrl);
    if (!(await deps.lexiconRepository.findByCode(normalized, { includeInactive: true }))) {
      throw new SignNotFoundError(code);
    }
    // La base también lo impide (índice único); aquí se avisa antes con un mensaje claro.
    if (valid.displayOrder != null && await deps.lexiconRepository.hasResourceAt(normalized, valid.displayOrder)) {
      throw new PositionTakenError(valid.displayOrder);
    }
    const created = await deps.lexiconRepository.addResource(normalized, valid);
    if (!created) throw new SignNotFoundError(code);
    return { success: true, message: 'Recurso agregado', data: created };
  };

export const makeRemoveResource = (deps: { lexiconRepository: LexiconRepository }) =>
  async ({ code, resourceId }: { code: string; resourceId: number }): Promise<LexiconResult> => {
    const id = parsePositiveInt(resourceId, 'resourceId');
    const removed = await deps.lexiconRepository.removeResource(normalizeCode(code), id);
    if (!removed) throw new SignNotFoundError(code);
    return { success: true, message: 'Recurso eliminado', data: { resourceId: id } };
  };
