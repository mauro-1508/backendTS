import { randomUUID } from 'node:crypto';
import { EventEnvelope } from './event_bus';

export const makeEnvelope = <T>(type: string, payload: T, eventId: string = randomUUID(), occurredAt: string = new Date().toISOString()): EventEnvelope<T> => ({
  eventId,
  type,
  occurredAt,
  payload,
});
