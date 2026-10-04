import { EventEnvelope } from '@traduce/shared';
import { UsageEvent } from '../domain/entity';
import { UsageEventRepository } from '../domain/repository';

export const TRANSLATION_PRODUCED = 'recognition.TranslationProduced';
export const USER_REGISTERED = 'iam.UserRegistered';

/** Payload tolerante: acepta `signCodes` (lista) o `signCode` (uno solo). */
interface TranslationProducedPayload {
  translationId?: string | number;
  userId?: string | number | null;
  signCode?: string;
  signCodes?: string[];
}
interface UserRegisteredPayload {
  userId?: string | number;
}

const idOrNull = (value: string | number | null | undefined): string | null =>
  value === undefined || value === null ? null : String(value);

const signCodesOf = (payload: TranslationProducedPayload): string[] => {
  const codes = payload.signCodes ?? (payload.signCode ? [payload.signCode] : []);
  return codes.filter(code => typeof code === 'string' && code.length > 0);
};

const baseOf = (envelope: EventEnvelope) => ({
  eventId: envelope.eventId,
  sessionId: null,
  createdAt: new Date(envelope.occurredAt),
});

/** Idempotente: si el eventId ya esta guardado, `save` lo ignora y no se cuenta dos veces. */
export const makeIngestTranslationProduced = (deps: { repository: UsageEventRepository }) =>
  async (envelope: EventEnvelope): Promise<void> => {
    const payload = (envelope.payload ?? {}) as TranslationProducedPayload;
    const event: UsageEvent = {
      ...baseOf(envelope),
      userId: idOrNull(payload.userId),
      section: 'TRANSLATION',
      eventType: 'TRANSLATION_COMPLETED',
      referenceType: payload.translationId === undefined ? null : 'TRANSLATION',
      referenceId: idOrNull(payload.translationId),
      signCodes: signCodesOf(payload),
    };
    await deps.repository.save(event);
  };

export const makeIngestUserRegistered = (deps: { repository: UsageEventRepository }) =>
  async (envelope: EventEnvelope): Promise<void> => {
    const payload = (envelope.payload ?? {}) as UserRegisteredPayload;
    const userId = idOrNull(payload.userId);
    const event: UsageEvent = {
      ...baseOf(envelope),
      userId,
      section: 'HOME',
      eventType: 'USER_REGISTERED',
      referenceType: userId === null ? null : 'USER',
      referenceId: userId,
      signCodes: [],
    };
    await deps.repository.save(event);
  };
