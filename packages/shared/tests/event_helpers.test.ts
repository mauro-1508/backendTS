import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { exponentialBackoffMs } from '../src/events/backoff';
import { EventEnvelope, EventPublisher } from '../src/events/event_bus';
import { InMemoryEventBus } from '../src/events/in_memory_event_bus';
import {
  isSignPublished, isSignWithdrawn, isTranslationProduced, isUserRegistered, withValidPayload,
} from '../src/events/payload_validators';
import { publishQuietly } from '../src/events/publish_quietly';
import { subscribeWithRetry } from '../src/events/subscribe_with_retry';

const validTranslation = {
  translationId: 1, userId: 2, gloss: 'HOLA', text: 'hola', occurredAt: '2026-10-01T10:00:00.000Z',
};

describe('validadores de payload', () => {
  test('UserRegistered', () => {
    assert.equal(isUserRegistered({ userId: 1, email: 'a@b.co', name: 'Ada' }), true);
    assert.equal(isUserRegistered({ userId: '1', email: 'a@b.co', name: 'Ada' }), false);
    assert.equal(isUserRegistered({ userId: 1, email: 'a@b.co' }), false);
    assert.equal(isUserRegistered({ userId: 1, email: 'a@b.co', name: '  ' }), false);
    assert.equal(isUserRegistered(null), false);
    assert.equal(isUserRegistered([]), false);
  });

  test('TranslationProduced admite userId nulo pero no tipos erróneos', () => {
    assert.equal(isTranslationProduced(validTranslation), true);
    assert.equal(isTranslationProduced({ ...validTranslation, userId: null }), true);
    assert.equal(isTranslationProduced({ ...validTranslation, userId: 'x' }), false);
    assert.equal(isTranslationProduced({ ...validTranslation, gloss: 5 }), false);
    assert.equal(isTranslationProduced({ ...validTranslation, occurredAt: 'ayer' }), false);
    assert.equal(isTranslationProduced({ userId: 1, signCodes: ['A'] }), false);
  });

  test('SignPublished y SignWithdrawn', () => {
    const published = { lexiconId: 1, code: 'A', type: 'LETTER', language: 'LSC', letter: null, categoryId: 2 };
    assert.equal(isSignPublished(published), true);
    assert.equal(isSignPublished({ ...published, categoryId: 'x' }), false);
    assert.equal(isSignWithdrawn({ lexiconId: 1, code: 'A' }), true);
    assert.equal(isSignWithdrawn({ code: 'A' }), false);
  });
});

describe('withValidPayload', () => {
  const envelope = (payload: unknown): EventEnvelope => ({
    eventId: 'e1', type: 'iam.UserRegistered', occurredAt: '2026-10-01T10:00:00.000Z', payload,
  });

  test('entrega los payloads válidos al handler', async () => {
    const received: unknown[] = [];
    const handler = withValidPayload(isUserRegistered, async event => { received.push(event.payload); });
    await handler(envelope({ userId: 1, email: 'a@b.co', name: 'Ada' }));
    assert.equal(received.length, 1);
  });

  test('descarta con log los inválidos sin llamar al handler ni lanzar', async () => {
    const logs: string[] = [];
    let calls = 0;
    const handler = withValidPayload(isUserRegistered, async () => { calls++; }, message => logs.push(message));
    await handler(envelope({ userId: 'x' }));
    assert.equal(calls, 0);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /iam\.UserRegistered/);
  });

  test('los errores del handler se propagan', async () => {
    const handler = withValidPayload(isUserRegistered, async () => { throw new Error('db caida'); });
    await assert.rejects(handler(envelope({ userId: 1, email: 'a@b.co', name: 'Ada' })), /db caida/);
  });
});

describe('publishQuietly', () => {
  test('publica en el bus', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    await bus.subscribe({ queue: 'q', pattern: '#' }, async e => { seen.push(e.type); });
    await publishQuietly(bus, 'a.B', {});
    assert.deepEqual(seen, ['a.B']);
  });

  test('si el broker falla no lanza', async () => {
    const failing: EventPublisher = { publish: async () => { throw new Error('caido'); } };
    const original = console.error;
    console.error = () => {};
    try {
      await publishQuietly(failing, 'a.B', {});
    } finally {
      console.error = original;
    }
  });
});

describe('exponentialBackoffMs', () => {
  test('duplica la espera y respeta el tope', () => {
    assert.deepEqual([0, 1, 2, 3].map(a => exponentialBackoffMs(a)), [1000, 2000, 4000, 8000]);
    assert.equal(exponentialBackoffMs(20), 30_000);
    assert.equal(exponentialBackoffMs(3, { baseMs: 10, maxMs: 50 }), 50);
  });
});

describe('subscribeWithRetry', () => {
  test('reintenta con backoff hasta que el broker responde', async () => {
    let attempts = 0;
    const subscriber = {
      subscribe: async () => { if (++attempts < 3) throw new Error('broker caido'); },
    };
    const waits: number[] = [];
    await subscribeWithRetry(subscriber, { queue: 'q', pattern: '#' }, async () => {}, {
      backoffMs: attempt => attempt * 10,
      sleep: async ms => { waits.push(ms); },
      log: () => {},
    });
    assert.equal(attempts, 3);
    assert.deepEqual(waits, [0, 10]);
  });

  test('no espera nada si la primera suscripción funciona', async () => {
    let slept = false;
    await subscribeWithRetry({ subscribe: async () => {} }, { queue: 'q', pattern: '#' }, async () => {}, {
      sleep: async () => { slept = true; },
    });
    assert.equal(slept, false);
  });
});
