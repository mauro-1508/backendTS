import { EventPublisher } from '../shared/events/event_publisher';
import { LEXICON_EVENTS, SignWithdrawnPayload } from '../domain/events';
import { LexiconRepository } from '../domain/repository';
import { normalizeCode, SignNotFoundError } from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';
import { publishQuietly } from './publish_event';

/**
 * Una seña no se borra: el historial de traducciones la referencia. Retirarla
 * es pasarla a INACTIVE, lo que la oculta del catálogo.
 */
export const makeDeactivateSign = (deps: { lexiconRepository: LexiconRepository; eventPublisher: EventPublisher }) =>
  async ({ code, userId }: { code: string; userId: number | null }): Promise<LexiconResult> => {
    const updated = await deps.lexiconRepository.setStatus(normalizeCode(code), 'INACTIVE', userId);
    if (!updated) throw new SignNotFoundError(code);
    const payload: SignWithdrawnPayload = { lexiconId: updated.lexiconId, code: updated.code };
    await publishQuietly(deps.eventPublisher, LEXICON_EVENTS.SignWithdrawn, payload);
    return { success: true, message: 'Seña retirada del catálogo', data: { code: updated.code, status: updated.status } };
  };
