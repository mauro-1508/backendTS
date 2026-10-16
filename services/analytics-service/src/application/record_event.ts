import { randomUUID } from 'node:crypto';
import { UsageEvent } from '../domain/entity';
import { UsageEventRepository } from '../domain/repository';
import {
  AccountErasedError, AnalyticsValidationError, parseClientEventType, parseClientReferenceType, parseSection, parseUuid,
} from '../domain/rules';
import { RecordEventInput } from '../ports/inbound/analytics_service';

const optional = <T>(value: unknown, parse: (v: unknown) => T): T | null =>
  value === undefined || value === null ? null : parse(value);

/** Evento que el cliente registra sobre si mismo; el userId sale siempre del JWT. */
export const makeRecordEvent = (deps: { repository: UsageEventRepository; newId?: () => string; now?: () => Date }) =>
  async (input: RecordEventInput): Promise<void> => {
    // Cuenta borrada con un JWT aun vigente: no se vuelve a ligar ningun hecho a esa persona.
    if (await deps.repository.isUserErased(String(input.userId))) throw new AccountErasedError();
    const referenceType = optional(input.referenceType, parseClientReferenceType);
    const referenceId = optional(input.referenceId, v => parseUuid('referenceId', v));
    if ((referenceType === null) !== (referenceId === null)) {
      throw new AnalyticsValidationError('referenceType y referenceId deben enviarse juntos');
    }
    const event: UsageEvent = {
      eventId: (deps.newId ?? randomUUID)(),
      userId: String(input.userId),
      sessionId: optional(input.sessionId, v => parseUuid('sessionId', v)),
      section: parseSection(input.section),
      eventType: parseClientEventType(input.eventType),
      referenceType,
      referenceId,
      signCodes: [],
      createdAt: (deps.now ?? (() => new Date()))(),
    };
    await deps.repository.save(event);
  };
