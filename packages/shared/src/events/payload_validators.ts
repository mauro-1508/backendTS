import { EventEnvelope, EventHandler } from './event_bus';
import { SignPublished, SignWithdrawn, TranslationProduced, UserRegistered } from './contracts';

export type PayloadGuard<T> = (payload: unknown) => payload is T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isString = (value: unknown): value is string => typeof value === 'string';
const isIsoDate = (value: unknown): value is string => isNonEmptyString(value) && !Number.isNaN(Date.parse(value));

export const isUserRegistered: PayloadGuard<UserRegistered> = (payload): payload is UserRegistered =>
  isRecord(payload) && isId(payload.userId) && isNonEmptyString(payload.email) && isNonEmptyString(payload.name);

export const isTranslationProduced: PayloadGuard<TranslationProduced> = (payload): payload is TranslationProduced =>
  isRecord(payload)
  && isId(payload.translationId)
  && (payload.userId === null || isId(payload.userId))
  && isString(payload.gloss)
  && isString(payload.text)
  && isIsoDate(payload.occurredAt);

export const isSignPublished: PayloadGuard<SignPublished> = (payload): payload is SignPublished =>
  isRecord(payload)
  && isId(payload.lexiconId)
  && isNonEmptyString(payload.code)
  && isNonEmptyString(payload.type)
  && isNonEmptyString(payload.language)
  && (payload.letter === null || isString(payload.letter))
  && isId(payload.categoryId);

export const isSignWithdrawn: PayloadGuard<SignWithdrawn> = (payload): payload is SignWithdrawn =>
  isRecord(payload) && isId(payload.lexiconId) && isNonEmptyString(payload.code);

/**
 * Envuelve un handler: si el payload no cumple el contrato, el evento se descarta con un
 * log (reintentarlo no lo arreglaria y solo bloquearia la cola). Los errores del handler
 * si se propagan para que el bus decida (cola de mensajes muertos).
 */
export const withValidPayload = <T>(
  isValid: PayloadGuard<T>,
  handle: (event: EventEnvelope<T>) => Promise<void>,
  log: (message: string) => void = message => console.error(message),
): EventHandler =>
  async event => {
    if (!isValid(event.payload)) {
      log(`[events] payload invalido en ${event.type} (${event.eventId}), se descarta`);
      return;
    }
    await handle(event as EventEnvelope<T>);
  };
