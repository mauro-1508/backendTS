import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEnvelope, InMemoryEventBus } from '@traduce/shared';
import { subscribeToDomainEvents } from '../src/adapters/inbound/events/subscriptions';
import { makeIngestTranslationProduced, makeIngestUserRegistered } from '../src/application/ingest_events';
import { makeInMemoryUsageRepository } from './helpers/fakes';

const USER_REGISTERED = { userId: 5, email: 'a@b.co', name: 'Ada' };

const envelope = (eventId: string, type: string, payload: unknown): EventEnvelope => ({
  eventId, type, occurredAt: '2026-10-01T15:00:00Z', payload,
});

const translation = (overrides: Record<string, unknown> = {}) => ({
  translationId: 9, userId: 3, gloss: 'HOLA', text: 'Hola', occurredAt: '2026-10-01T15:00:00Z', ...overrides,
});

const captureErrors = async (run: () => Promise<void>): Promise<string[]> => {
  const original = console.error;
  const logged: string[] = [];
  console.error = (message: string) => { logged.push(message); };
  try {
    await run();
  } finally {
    console.error = original;
  }
  return logged;
};

describe('handlers de eventos', () => {
  test('TranslationProduced se guarda como TRANSLATION_COMPLETED con las señas de gloss', async () => {
    const repository = makeInMemoryUsageRepository();
    await makeIngestTranslationProduced({ repository })(
      envelope('e1', 'recognition.TranslationProduced', translation({ gloss: ' HOLA  GRACIAS ' })));
    assert.equal(repository.events.length, 1);
    assert.equal(repository.events[0].eventType, 'TRANSLATION_COMPLETED');
    assert.equal(repository.events[0].userId, '3');
    assert.deepEqual(repository.events[0].signCodes, ['HOLA', 'GRACIAS']);
    assert.equal(repository.events[0].referenceId, '9');
  });

  test('acepta userId nulo (traducción anónima)', async () => {
    const repository = makeInMemoryUsageRepository();
    await makeIngestTranslationProduced({ repository })(
      envelope('e2', 'recognition.TranslationProduced', translation({ userId: null })));
    assert.equal(repository.events[0].userId, null);
  });

  test('es idempotente: el mismo eventId no se cuenta dos veces', async () => {
    const repository = makeInMemoryUsageRepository();
    const handler = makeIngestTranslationProduced({ repository });
    const event = envelope('dup', 'recognition.TranslationProduced', translation());
    await handler(event);
    await handler(event);
    assert.equal(repository.events.length, 1);
  });

  test('UserRegistered se guarda como USER_REGISTERED, también idempotente', async () => {
    const repository = makeInMemoryUsageRepository();
    const handler = makeIngestUserRegistered({ repository });
    const event = envelope('u1', 'iam.UserRegistered', USER_REGISTERED);
    await handler(event);
    await handler(event);
    assert.equal(repository.events.length, 1);
    assert.equal(repository.events[0].eventType, 'USER_REGISTERED');
    assert.equal(repository.events[0].userId, '5');
  });

  test('descarta con log los payloads que no cumplen el contrato', async () => {
    const repository = makeInMemoryUsageRepository();
    const logged = await captureErrors(async () => {
      await makeIngestTranslationProduced({ repository })(envelope('x1', 'recognition.TranslationProduced', { signCode: 'A' }));
      await makeIngestTranslationProduced({ repository })(envelope('x2', 'recognition.TranslationProduced', translation({ userId: 'abc' })));
      await makeIngestUserRegistered({ repository })(envelope('x3', 'iam.UserRegistered', { userId: 5 }));
      await makeIngestUserRegistered({ repository })(envelope('x4', 'iam.UserRegistered', null));
    });
    assert.equal(repository.events.length, 0);
    assert.equal(logged.length, 4);
  });

  test('suscribe ambos eventos y recibe lo publicado en el bus', async () => {
    const repository = makeInMemoryUsageRepository();
    const bus = new InMemoryEventBus();
    await subscribeToDomainEvents({ subscriber: bus, repository });
    await bus.publish('iam.UserRegistered', USER_REGISTERED);
    await bus.publish('recognition.TranslationProduced', translation({ gloss: 'A' }));
    await bus.publish('lexicon.SignPublished', {});
    assert.deepEqual(repository.events.map(e => e.eventType), ['USER_REGISTERED', 'TRANSLATION_COMPLETED']);
  });

  test('cada evento usa su propia cola (una cola compartida mezclaria los handlers)', async () => {
    const queues: string[] = [];
    const subscriber = { subscribe: async ({ queue }: { queue: string }) => { queues.push(queue); } };
    await subscribeToDomainEvents({ subscriber, repository: makeInMemoryUsageRepository() });
    assert.equal(new Set(queues).size, 2);
  });
});
