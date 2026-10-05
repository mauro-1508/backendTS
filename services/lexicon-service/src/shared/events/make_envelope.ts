import { randomUUID } from 'node:crypto';
import { EventEnvelope } from './event_publisher';

export const makeEnvelope = <T>(type: string, payload: T): EventEnvelope<T> => ({
  eventId: randomUUID(),
  type,
  occurredAt: new Date().toISOString(),
  payload,
});
