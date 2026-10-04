import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEnvelope, InMemoryEventBus } from '@traduce/shared';
import { subscribeToDomainEvents } from '../src/adapters/inbound/events/subscriptions';
import { makeIngestTranslationProduced, makeIngestUserRegistered } from '../src/application/ingest_events';
import { makeInMemoryUsageRepository } from './helpers/fakes';

const envelope = (eventId: string, type: string, payload: unknown): EventEnvelope => ({
  eventId, type, occurredAt: '2026-10-01T15:00:00Z', payload,
});

describe('handlers de eventos', () => {
  test('TranslationProduced se guarda como TRANSLATION_COMPLETED con sus señas', async () => {
    const repository = makeInMemoryUsageRepository();
    await makeIngestTranslationProduced({ repository })(
      envelope('e1', 'recognition.TranslationProduced', { translationId: 9, userId: 3, signCodes: ['HOLA'] }));
    assert.equal(repository.events.length, 1);
    assert.equal(repository.events[0].eventType, 'TRANSLATION_COMPLETED');
    assert.equal(repository.events[0].userId, '3');
    assert.deepEqual(repository.events[0].signCodes, ['HOLA']);
    assert.equal(repository.events[0].referenceId, '9');
  });

  test('acepta signCode suelto y userId ausente', async () => {
    const repository = makeInMemoryUsageRepository();
    await makeIngestTranslationProduced({ repository })(envelope('e2', 'x', { signCode: 'A' }));
    assert.deepEqual(repository.events[0].signCodes, ['A']);
    assert.equal(repository.events[0].userId, null);
  });

  test('es idempotente: el mismo eventId no se cuenta dos veces', async () => {
    const repository = makeInMemoryUsageRepository();
    const handler = makeIngestTranslationProduced({ repository });
    const event = envelope('dup', 'recognition.TranslationProduced', { userId: 1, signCodes: ['HOLA'] });
    await handler(event);
    await handler(event);
    assert.equal(repository.events.length, 1);
  });

  test('UserRegistered se guarda como USER_REGISTERED, también idempotente', async () => {
    const repository = makeInMemoryUsageRepository();
    const handler = makeIngestUserRegistered({ repository });
    const event = envelope('u1', 'iam.UserRegistered', { userId: 5 });
    await handler(event);
    await handler(event);
    assert.equal(repository.events.length, 1);
    assert.equal(repository.events[0].eventType, 'USER_REGISTERED');
    assert.equal(repository.events[0].userId, '5');
  });

  test('suscribe ambos eventos y recibe lo publicado en el bus', async () => {
    const repository = makeInMemoryUsageRepository();
    const bus = new InMemoryEventBus();
    await subscribeToDomainEvents({ subscriber: bus, repository });
    await bus.publish('iam.UserRegistered', { userId: 1 });
    await bus.publish('recognition.TranslationProduced', { userId: 1, signCodes: ['A'] });
    await bus.publish('lexicon.SignPublished', {});
    assert.deepEqual(repository.events.map(e => e.eventType), ['USER_REGISTERED', 'TRANSLATION_COMPLETED']);
  });
});
