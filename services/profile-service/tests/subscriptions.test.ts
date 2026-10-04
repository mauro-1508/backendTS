import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryEventBus } from '@traduce/shared';
import { subscribeToEvents } from '../src/adapters/inbound/events/subscriptions';

describe('suscripciones a eventos', () => {
  it('acepta userId entero (iam/recognition) y lo entrega como texto', async () => {
    const bus = new InMemoryEventBus();
    const translatedBy: string[] = [];
    const registered: string[] = [];
    await subscribeToEvents(bus, {
      registerUserProfile: async (_eventId: string, payload: { userId: string }) => { registered.push(payload.userId); },
      recordTranslation: async (_eventId: string, userId: string) => { translatedBy.push(userId); },
    } as never);

    await bus.publish('iam.UserRegistered', { userId: 7, email: 'a@b.co', name: 'Ada' });
    await bus.publish('recognition.TranslationProduced', { userId: 7, gloss: 'HOLA' });

    assert.deepEqual(registered, ['7']);
    assert.deepEqual(translatedBy, ['7']);
  });
});
