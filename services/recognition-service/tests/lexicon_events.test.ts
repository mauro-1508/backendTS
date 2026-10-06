import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEventBus } from '@traduce/shared';
import { makeLexiconEventHandler, subscribeToLexiconEvents } from '../src/events/lexicon_events_subscriber';

const SIGN_PUBLISHED = {
  lexiconId: 1, code: 'HOLA', type: 'WORD', language: 'LSC', letter: null, categoryId: 2,
};

const event = (eventId: string, type: string, payload: unknown = SIGN_PUBLISHED) => ({
  eventId, type, occurredAt: '2026-01-01T00:00:00.000Z', payload,
});

describe('lexicon_events_subscriber', () => {
  test('registra SignPublished y SignWithdrawn', async () => {
    const logs: string[] = [];
    const handler = makeLexiconEventHandler(message => logs.push(message));
    await handler(event('1', 'lexicon.SignPublished'));
    await handler(event('2', 'lexicon.SignWithdrawn', { lexiconId: 1, code: 'HOLA' }));
    assert.equal(logs.length, 2);
  });

  test('es idempotente: el mismo eventId se procesa una sola vez', async () => {
    const logs: string[] = [];
    const handler = makeLexiconEventHandler(message => logs.push(message));
    await handler(event('1', 'lexicon.SignPublished'));
    await handler(event('1', 'lexicon.SignPublished'));
    assert.equal(logs.length, 1);
  });

  test('ignora otros eventos de lexicon', async () => {
    const logs: string[] = [];
    const handler = makeLexiconEventHandler(message => logs.push(message));
    await handler(event('1', 'lexicon.CategoryCreated'));
    assert.equal(logs.length, 0);
  });

  test('descarta con log un payload que no cumple el contrato', async () => {
    const logs: string[] = [];
    const handler = makeLexiconEventHandler(message => logs.push(message));
    const originalError = console.error;
    const errors: string[] = [];
    console.error = (message: string) => { errors.push(message); };
    try {
      await handler(event('1', 'lexicon.SignPublished', { code: 'HOLA' }));
      await handler(event('2', 'lexicon.SignWithdrawn', null));
    } finally {
      console.error = originalError;
    }
    assert.equal(logs.length, 0);
    assert.equal(errors.length, 2);
  });

  test('se suscribe por el bus a lexicon.*', async () => {
    const logs: string[] = [];
    const bus = new InMemoryEventBus();
    await subscribeToLexiconEvents(bus, makeLexiconEventHandler(message => logs.push(message)));
    await bus.publish('lexicon.SignPublished', SIGN_PUBLISHED);
    await bus.publish('recognition.TranslationProduced', {});
    assert.equal(logs.length, 1);
  });

  test('si el broker no está disponible reintenta en vez de rechazar', async () => {
    let attempts = 0;
    const subscriber = {
      subscribe: async () => { if (++attempts < 2) throw new Error('broker caido'); },
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      await subscribeToLexiconEvents(subscriber, async () => {});
    } finally {
      console.error = originalError;
    }
    assert.equal(attempts, 2);
  });
});
