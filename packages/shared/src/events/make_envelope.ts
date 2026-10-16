import { randomUUID } from 'node:crypto';
import { EventEnvelope } from './event_bus';

export const makeEnvelope = <T>(type: string, payload: T, eventId: string = randomUUID()): EventEnvelope<T> => ({
  eventId,
  type,
  occurredAt: new Date().toISOString(),
  payload,
});
