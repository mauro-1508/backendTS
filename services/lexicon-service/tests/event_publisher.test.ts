import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LEXICON_EVENTS } from '../src/domain/events';
import { createEventPublisher } from '../src/shared/events/create_event_publisher';
import { InMemoryEventPublisher } from '../src/shared/events/in_memory_event_publisher';
import { RabbitMqEventPublisher } from '../src/shared/events/rabbitmq_event_publisher';

const makeFakeBroker = () => {
  const published: unknown[][] = [];
  const channel = {
    on: () => undefined,
    assertExchange: async () => undefined,
    publish: (...args: unknown[]) => { published.push(args); return true; },
  };
  const connection = { on: () => undefined, createChannel: async () => channel, close: async () => undefined };
  return { published, connection };
};

describe('publicadores de eventos', () => {
  test('InMemory guarda el sobre con eventId, type, occurredAt y payload', async () => {
    const publisher = new InMemoryEventPublisher();
    await publisher.publish(LEXICON_EVENTS.SignWithdrawn, { lexiconId: 1, code: 'HOLA' });
    const [event] = publisher.published;
    assert.equal(event.type, 'lexicon.SignWithdrawn');
    assert.deepEqual(event.payload, { lexiconId: 1, code: 'HOLA' });
    assert.ok(event.eventId);
    assert.ok(!Number.isNaN(Date.parse(event.occurredAt)));
  });

  test('createEventPublisher: sin URL usa memoria, con URL usa RabbitMQ', () => {
    assert.ok(createEventPublisher('') instanceof InMemoryEventPublisher);
    assert.ok(createEventPublisher('amqp://localhost') instanceof RabbitMqEventPublisher);
  });

  test('RabbitMQ publica en el exchange topic con la routing key del evento', async () => {
    const { published, connection } = makeFakeBroker();
    const publisher = new RabbitMqEventPublisher('amqp://x', (async () => connection) as never);
    await publisher.publish(LEXICON_EVENTS.SignPublished, { code: 'HOLA' });
    assert.equal(published[0][0], 'traduce.events');
    assert.equal(published[0][1], 'lexicon.SignPublished');
    assert.equal(JSON.parse((published[0][2] as Buffer).toString()).payload.code, 'HOLA');
    await publisher.close();
  });

  test('RabbitMQ: si el broker no está, publish falla y un intento posterior reconecta', async () => {
    const { connection } = makeFakeBroker();
    let attempts = 0;
    const publisher = new RabbitMqEventPublisher('amqp://x', (async () => {
      if (++attempts === 1) throw new Error('broker caido');
      return connection;
    }) as never);
    await assert.rejects(publisher.publish('lexicon.SignPublished', {}), /broker caido/);
    await publisher.publish('lexicon.SignPublished', {});
    assert.equal(attempts, 2);
  });
});
