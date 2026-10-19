import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  DEAD_LETTER_EXCHANGE, DEFAULT_PREFETCH, EVENTS_EXCHANGE, RabbitMqEventBus,
} from '../src/events/rabbitmq_event_bus';

type Consumer = (message: unknown) => void;

class FakeChannel extends EventEmitter {
  prefetchValue?: number;
  queues = new Map<string, Record<string, unknown>>();
  bindings: Array<{ queue: string; exchange: string; key: string }> = [];
  consumers = new Map<string, Consumer>();
  acked: unknown[] = [];
  nacked: Array<{ message: unknown; requeue: boolean }> = [];

  async prefetch(count: number) { this.prefetchValue = count; }
  async assertExchange() { return {}; }
  async assertQueue(queue: string, options: Record<string, unknown>) { this.queues.set(queue, options); return {}; }
  async bindQueue(queue: string, exchange: string, key: string) { this.bindings.push({ queue, exchange, key }); }
  async consume(queue: string, consumer: Consumer) { this.consumers.set(queue, consumer); return {}; }
  published: Array<{ exchange: string; key: string; body: Buffer }> = [];
  confirmError?: Error;
  publishOptions: Array<Record<string, unknown>> = [];
  unroutable = false;
  publish(exchange: string, key: string, body: Buffer, options: Record<string, unknown> = {}, confirmed?: (error: Error | null) => void) {
    this.published.push({ exchange, key, body });
    this.publishOptions.push(options);
    // El broker devuelve (basic.return) los mandatory sin cola destino, antes de confirmarlos.
    if (this.unroutable && options.mandatory) this.emit('return', { properties: { messageId: options.messageId } });
    if (!this.neverConfirm) queueMicrotask(() => confirmed?.(this.confirmError ?? null));
    return true;
  }
  neverConfirm = false;
  async waitForConfirms() {
    if (this.neverConfirm) return new Promise<void>(() => {});
    if (this.confirmError) throw this.confirmError;
  }
  ackError?: Error;
  ack(message: unknown) { if (this.ackError) throw this.ackError; this.acked.push(message); }
  nack(message: unknown, _allUpTo: boolean, requeue: boolean) { if (this.ackError) throw this.ackError; this.nacked.push({ message, requeue }); }
}

class FakeConnection extends EventEmitter {
  readonly channel = new FakeChannel();
  async createConfirmChannel() { return this.channel; }
  async close() { this.emit('close'); }
}

const makeConnector = (failures = 0) => {
  const connections: FakeConnection[] = [];
  let remainingFailures = failures;
  let attempts = 0;
  const connect = async () => {
    attempts++;
    if (remainingFailures-- > 0) throw new Error('broker caido');
    const connection = new FakeConnection();
    connections.push(connection);
    return connection as never;
  };
  return { connect, connections, attempts: () => attempts };
};

const messageOf = (routingKey: string, content: object | string = { eventId: 'e1' }) => ({
  fields: { routingKey },
  content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
});

const waitFor = async (condition: () => boolean, timeoutMs = 1000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timeout esperando la condicion');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

const silenceLogs = <T>(run: () => Promise<T>): Promise<T> => {
  const { error, warn, log } = console;
  console.error = console.warn = console.log = () => {};
  return run().finally(() => { Object.assign(console, { error, warn, log }); });
};

const SUBSCRIPTION = { queue: 'svc.queue', pattern: 'iam.*' };

describe('RabbitMqEventBus', () => {
  test('declara la cola con DLX, su cola de muertos y el prefetch indicado', async () => {
    const { connect, connections } = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect, prefetch: 1 });
    await bus.subscribe(SUBSCRIPTION, async () => {});

    const channel = connections[0].channel;
    assert.equal(channel.prefetchValue, 1);
    assert.deepEqual(channel.queues.get('svc.queue'), {
      durable: true, deadLetterExchange: DEAD_LETTER_EXCHANGE, deadLetterRoutingKey: 'svc.queue',
    });
    assert.ok(channel.queues.has('svc.queue.dead'));
    assert.ok(channel.bindings.some(b => b.queue === 'svc.queue.dead' && b.exchange === DEAD_LETTER_EXCHANGE));
    assert.ok(channel.bindings.some(b => b.queue === 'svc.queue' && b.exchange === EVENTS_EXCHANGE && b.key === 'iam.*'));
    await bus.close();
  });

  test('usa el prefetch por defecto si no se configura', async () => {
    const { connect, connections } = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect });
    await bus.subscribe(SUBSCRIPTION, async () => {});
    assert.equal(connections[0].channel.prefetchValue, DEFAULT_PREFETCH);
    await bus.close();
  });

  test('ack si el handler termina; nack sin reencolar (a la cola de muertos) si falla', async () => {
    const { connect, connections } = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect });
    let shouldFail = false;
    await bus.subscribe(SUBSCRIPTION, async () => { if (shouldFail) throw new Error('boom'); });
    const channel = connections[0].channel;
    const consumer = channel.consumers.get('svc.queue')!;

    const good = messageOf('iam.UserRegistered');
    consumer(good);
    await waitFor(() => channel.acked.length === 1);
    assert.equal(channel.acked[0], good);

    shouldFail = true;
    await silenceLogs(async () => {
      consumer(messageOf('iam.UserRegistered'));
      consumer(messageOf('iam.UserRegistered', 'no es json'));
      await waitFor(() => channel.nacked.length === 2);
    });
    assert.deepEqual(channel.nacked.map(n => n.requeue), [false, false]);
    await bus.close();
  });

  test('si la conexion se cae, reconecta con backoff y vuelve a registrar las suscripciones', async () => {
    const connector = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect: connector.connect, reconnectDelayMs: () => 1 });
    const received: string[] = [];
    await bus.subscribe(SUBSCRIPTION, async event => { received.push(event.eventId); });

    await silenceLogs(async () => {
      connector.connections[0].emit('close');
      await waitFor(() => connector.connections.length === 2);
      await waitFor(() => connector.connections[1].channel.consumers.has('svc.queue'));
    });

    connector.connections[1].channel.consumers.get('svc.queue')!(messageOf('iam.UserRegistered', { eventId: 'tras-reconexion' }));
    await waitFor(() => received.length === 1);
    assert.deepEqual(received, ['tras-reconexion']);
    await bus.close();
  });

  test('reintenta la reconexion con espera creciente mientras el broker siga caido', async () => {
    const connector = makeConnector();
    const attemptsSeen: number[] = [];
    const bus = new RabbitMqEventBus('amqp://x', {
      connect: connector.connect,
      reconnectDelayMs: attempt => { attemptsSeen.push(attempt); return 1; },
    });
    await bus.subscribe(SUBSCRIPTION, async () => {});

    // Los dos primeros intentos de reconexion fallan; el tercero funciona.
    const afterOutage = makeConnector(2);
    (bus as unknown as { connectFn: unknown }).connectFn = afterOutage.connect;

    await silenceLogs(async () => {
      connector.connections[0].emit('close');
      await waitFor(() => afterOutage.connections.length === 1);
      await waitFor(() => afterOutage.connections[0].channel.consumers.has('svc.queue'));
    });
    assert.equal(afterOutage.attempts(), 3);
    assert.deepEqual(attemptsSeen.slice(0, 3), [0, 1, 2]);
    await bus.close();
  });

  test('publish resuelve solo tras la confirmacion del broker y respeta el eventId dado', async () => {
    const { connect, connections } = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect });
    await bus.publish('iam.UserDeleted', { userId: 1 }, { eventId: 'fijo-1' });
    await bus.publish('iam.UserDeleted', { userId: 2 });
    const [first, second] = connections[0].channel.published.map(p => JSON.parse(p.body.toString()));
    assert.equal(first.eventId, 'fijo-1');
    assert.notEqual(second.eventId, 'fijo-1');
    assert.ok(second.eventId);
    await bus.close();
  });

  test('si el broker no confirma (nack), publish rechaza', async () => {
    const { connect, connections } = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect });
    await bus.publish('iam.UserDeleted', { userId: 1 });
    connections[0].channel.confirmError = new Error('nack del broker');
    await assert.rejects(bus.publish('iam.UserDeleted', { userId: 1 }), /nack del broker/);
    await bus.close();
  });

  test('con mandatory, un mensaje sin ruta (basic.return) hace fallar ese publish', async () => {
    const { connect, connections } = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect });
    await bus.publish('iam.UserDeleted', { userId: 1 }, { eventId: 'm1', mandatory: true });
    const channel = connections[0].channel;
    assert.equal(channel.publishOptions[0].mandatory, true);
    assert.equal(channel.publishOptions[0].messageId, 'm1');

    channel.unroutable = true;
    await assert.rejects(bus.publish('iam.UserDeleted', { userId: 1 }, { eventId: 'm2', mandatory: true }), /ninguna cola/);
    // Sin mandatory publicar sin consumidores sigue siendo normal.
    await bus.publish('iam.UserDeleted', { userId: 1 }, { eventId: 'm3' });
    assert.equal(channel.publishOptions[2].mandatory, false);
    // El retorno de m2 no contamina a un reintento posterior que si tiene ruta.
    channel.unroutable = false;
    await bus.publish('iam.UserDeleted', { userId: 1 }, { eventId: 'm2', mandatory: true });
    await bus.close();
  });

  test('publish rechaza si el broker no confirma a tiempo', async () => {
    const { connect, connections } = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect, confirmTimeoutMs: 20 });
    await bus.publish('iam.UserDeleted', { userId: 1 });
    connections[0].channel.neverConfirm = true;
    await assert.rejects(bus.publish('iam.UserDeleted', { userId: 1 }), /no confirmo/);
    await assert.rejects(
      bus.publish('iam.UserDeleted', { userId: 1 }),
      (error: Error) => error.constructor.name === 'PublishTimeoutError',
    );
    await bus.close();
  });

  test('tras close(), publish y subscribe rechazan', async () => {
    const { connect } = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect });
    await bus.publish('iam.UserDeleted', { userId: 1 });
    await bus.close();
    await assert.rejects(bus.publish('iam.UserDeleted', { userId: 1 }), /cerrado/);
    await assert.rejects(bus.subscribe(SUBSCRIPTION, async () => {}), /cerrado/);
  });

  test('ack/nack sobre un canal cerrado no genera unhandled rejection', async () => {
    const { connect, connections } = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect });
    let fail = false;
    await bus.subscribe(SUBSCRIPTION, async () => { if (fail) throw new Error('boom'); });
    const channel = connections[0].channel;
    channel.ackError = new Error('Channel closed');
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const logs: unknown[][] = [];
    await silenceLogs(async () => {
      const original = console.error;
      console.error = (...args: unknown[]) => { logs.push(args); };
      try {
        const consumer = channel.consumers.get('svc.queue')!;
        consumer(messageOf('iam.UserRegistered'));
        fail = true;
        consumer(messageOf('iam.UserRegistered'));
        await waitFor(() => logs.filter(l => String(l[0]).includes('no se pudo confirmar')).length === 2);
        await new Promise(resolve => setTimeout(resolve, 20));
      } finally {
        console.error = original;
      }
    });
    process.off('unhandledRejection', onUnhandled);
    assert.deepEqual(unhandled, []);
    await bus.close();
  });

  test('close() no dispara reconexion', async () => {
    const connector = makeConnector();
    const bus = new RabbitMqEventBus('amqp://x', { connect: connector.connect, reconnectDelayMs: () => 1 });
    await bus.subscribe(SUBSCRIPTION, async () => {});
    await bus.close();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(connector.connections.length, 1);
  });

  test('si el broker no esta al suscribir, subscribe rechaza (para que subscribeWithRetry reintente)', async () => {
    const bus = new RabbitMqEventBus('amqp://x', { connect: makeConnector(1).connect });
    await assert.rejects(bus.subscribe(SUBSCRIPTION, async () => {}), /broker caido/);
  });
});

 test('UserDeleted provisiona las tres colas aunque no haya consumidores activos', async () => {
  const { connect, connections } = makeConnector();
  const bus = new RabbitMqEventBus('amqp://test', { connect });
  await bus.publish('iam.UserDeleted', { userId: 7 }, {
    mandatory: true, eventId: 'deletion', occurredAt: '2020-01-01T00:00:00Z',
  });
  const channel = connections[0].channel;
  for (const service of ['profile', 'recognition', 'analytics']) {
    const queue = `${service}-service.user-deleted`;
    assert.equal(channel.queues.get(queue)?.durable, true);
    assert.ok(channel.bindings.some(b => b.queue === queue && b.key === 'iam.UserDeleted'));
  }
  assert.equal(JSON.parse(channel.published[0].body.toString()).occurredAt, '2020-01-01T00:00:00Z');
  await bus.close();
});

test('no publica la eliminación si falla la provisión de uno de los consumidores', async () => {
  const { connect, connections } = makeConnector();
  const bus = new RabbitMqEventBus('amqp://test', { connect });
  await bus.publish('test.Warmup', {});
  const channel = connections[0].channel;
  const declare = channel.assertQueue.bind(channel);
  channel.assertQueue = async (queue, options) => {
    if (queue === 'analytics-service.user-deleted') throw new Error('provision_failed');
    return declare(queue, options);
  };
  await assert.rejects(bus.publish('iam.UserDeleted', { userId: 7 }, { mandatory: true }), /provision_failed/);
  assert.equal(channel.published.length, 1);
  await bus.close();
});

test('cada publicación espera solo su confirmación aunque otra siga pendiente', async () => {
  const { connect, connections } = makeConnector();
  const bus = new RabbitMqEventBus('amqp://test', { connect });
  await bus.publish('test.Warmup', {});
  const channel = connections[0].channel;
  channel.neverConfirm = true;
  const publish = channel.publish.bind(channel);
  const callbacks: Array<(error: Error | null) => void> = [];
  channel.publish = (exchange, key, body, options = {}, confirmed) => {
    if (confirmed) callbacks.push(confirmed);
    return publish(exchange, key, body, options);
  };
  const first = bus.publish('test.First', {});
  const second = assert.rejects(bus.publish('test.Second', {}), /second_nack/);
  await waitFor(() => callbacks.length === 2);
  callbacks[0](null);
  await first;
  callbacks[1](new Error('second_nack'));
  await second;
  await bus.close();
});
