import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchesTopic } from '../src/events/topic_matcher';
import { InMemoryEventBus } from '../src/events/in_memory_event_bus';
import { createEventBus } from '../src/events/create_event_bus';
import { RabbitMqEventBus } from '../src/events/rabbitmq_event_bus';
import { EventEnvelope } from '../src/events/event_bus';

describe('matchesTopic', () => {
  test('coincidencia exacta', () => {
    assert.equal(matchesTopic('lexicon.SignPublished', 'lexicon.SignPublished'), true);
    assert.equal(matchesTopic('lexicon.SignPublished', 'lexicon.SignWithdrawn'), false);
  });

  test('* reemplaza exactamente una palabra', () => {
    assert.equal(matchesTopic('lexicon.*', 'lexicon.SignPublished'), true);
    assert.equal(matchesTopic('*.SignPublished', 'lexicon.SignPublished'), true);
    assert.equal(matchesTopic('lexicon.*', 'lexicon.a.b'), false);
    assert.equal(matchesTopic('lexicon.*', 'lexicon'), false);
  });

  test('# reemplaza cero o mas palabras', () => {
    assert.equal(matchesTopic('#', 'iam.UserRegistered'), true);
    assert.equal(matchesTopic('lexicon.#', 'lexicon.SignPublished'), true);
    assert.equal(matchesTopic('lexicon.#', 'lexicon'), true);
    assert.equal(matchesTopic('lexicon.#', 'iam.UserRegistered'), false);
    assert.equal(matchesTopic('#.Published', 'a.b.Published'), true);
  });
});

describe('InMemoryEventBus', () => {
  test('entrega el evento con sobre completo a los suscriptores del patron', async () => {
    const bus = new InMemoryEventBus();
    const received: EventEnvelope[] = [];
    await bus.subscribe({ queue: 'q', pattern: 'lexicon.*' }, async e => { received.push(e); });

    await bus.publish('lexicon.SignPublished', { code: 'A' });

    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'lexicon.SignPublished');
    assert.deepEqual(received[0].payload, { code: 'A' });
    assert.ok(received[0].eventId);
    assert.ok(!Number.isNaN(Date.parse(received[0].occurredAt)));
  });

  test('no entrega eventos que no coinciden', async () => {
    const bus = new InMemoryEventBus();
    let calls = 0;
    await bus.subscribe({ queue: 'q', pattern: 'iam.*' }, async () => { calls++; });
    await bus.publish('lexicon.SignPublished', {});
    assert.equal(calls, 0);
  });

  test('cada evento publicado recibe un eventId distinto', async () => {
    const bus = new InMemoryEventBus();
    const ids = new Set<string>();
    await bus.subscribe({ queue: 'q', pattern: '#' }, async e => { ids.add(e.eventId); });
    await bus.publish('a.B', {});
    await bus.publish('a.B', {});
    assert.equal(ids.size, 2);
  });

  test('close() elimina las suscripciones', async () => {
    const bus = new InMemoryEventBus();
    let calls = 0;
    await bus.subscribe({ queue: 'q', pattern: '#' }, async () => { calls++; });
    await bus.close();
    await bus.publish('a.B', {});
    assert.equal(calls, 0);
  });
});

describe('createEventBus', () => {
  test('sin URL devuelve el bus en memoria', () => {
    assert.ok(createEventBus('') instanceof InMemoryEventBus);
  });

  test('con URL devuelve RabbitMQ (sin conectar hasta el primer uso)', () => {
    assert.ok(createEventBus('amqp://localhost') instanceof RabbitMqEventBus);
  });
});
