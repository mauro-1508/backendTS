import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEventBus } from '@traduce/shared';
import { makeLexiconEventHandler, subscribeToLexiconEvents } from '../src/events/lexicon_events_subscriber';

const event = (eventId: string, type: string) => ({
  eventId, type, occurredAt: '2026-01-01T00:00:00.000Z', payload: { code: 'HOLA' },
});

describe('lexicon_events_subscriber', () => {
  test('registra SignPublished y SignWithdrawn', async () => {
    const logs: string[] = [];
    const handler = makeLexiconEventHandler(message => logs.push(message));
    await handler(event('1', 'lexicon.SignPublished'));
    await handler(event('2', 'lexicon.SignWithdrawn'));
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

  test('se suscribe por el bus a lexicon.*', async () => {
    const logs: string[] = [];
    const bus = new InMemoryEventBus();
    await subscribeToLexiconEvents(bus, makeLexiconEventHandler(message => logs.push(message)));
    await bus.publish('lexicon.SignPublished', { code: 'A' });
    await bus.publish('recognition.TranslationProduced', {});
    assert.equal(logs.length, 1);
  });
});
