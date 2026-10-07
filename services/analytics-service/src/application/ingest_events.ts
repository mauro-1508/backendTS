import {
  EventEnvelope, EventHandler, isTranslationProduced, isUserRegistered, withValidPayload,
} from '@traduce/shared';
import { UsageEvent } from '../domain/entity';
import { UsageEventRepository } from '../domain/repository';

const GLOSS_SEPARATOR = /\s+/;

/** `gloss`: senas separadas por espacios (contrato de recognition). */
const signCodesOf = (gloss: string): string[] => gloss.split(GLOSS_SEPARATOR).filter(code => code.length > 0);

const idOrNull = (value: number | null): string | null => (value === null ? null : String(value));

const baseOf = (envelope: EventEnvelope<unknown>) => ({
  eventId: envelope.eventId,
  sessionId: null,
  createdAt: new Date(envelope.occurredAt),
});

/** Idempotente: si el eventId ya esta guardado, `save` lo ignora y no se cuenta dos veces. */
export const makeIngestTranslationProduced = (deps: { repository: UsageEventRepository }): EventHandler =>
  withValidPayload(isTranslationProduced, async envelope => {
    const { payload } = envelope;
    const event: UsageEvent = {
      ...baseOf(envelope),
      userId: idOrNull(payload.userId),
      section: 'TRANSLATION',
      eventType: 'TRANSLATION_COMPLETED',
      referenceType: 'TRANSLATION',
      referenceId: String(payload.translationId),
      signCodes: signCodesOf(payload.gloss),
    };
    await deps.repository.save(event);
  });

export const makeIngestUserRegistered = (deps: { repository: UsageEventRepository }): EventHandler =>
  withValidPayload(isUserRegistered, async envelope => {
    const userId = String(envelope.payload.userId);
    const event: UsageEvent = {
      ...baseOf(envelope),
      userId,
      section: 'HOME',
      eventType: 'USER_REGISTERED',
      referenceType: 'USER',
      referenceId: userId,
      signCodes: [],
    };
    await deps.repository.save(event);
  });
