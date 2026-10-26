import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEnvelope } from '../src/events/event_bus';
import { withRetry } from '../src/events/retry_handler';
import { makeConsumerRetryCheck, makeRetryMonitor } from '../src/events/retry_monitor';
import { InvalidEventPayloadError } from '../src/events/payload_validators';

const event = (eventId: string): EventEnvelope =>
  ({ eventId, type: 'iam.UserDeleted', occurredAt: '2026-10-26T12:00:00Z', payload: { userId: 7 } });

describe('makeRetryMonitor', () => {
  test('cuenta desde el primer fallo y olvida el evento al terminar', () => {
    let now = 0;
    const monitor = makeRetryMonitor(() => now);
    monitor.retrying(event('e1'));
    now = 5 * 60_000;
    monitor.retrying(event('e1'));
    monitor.retrying(event('e2'));
    now = 11 * 60_000;

    assert.deepEqual(monitor.stuck(10 * 60_000), [{ eventId: 'e1', type: 'iam.UserDeleted', retryingSeconds: 660 }]);
    monitor.settled('e1');
    assert.deepEqual(monitor.stuck(10 * 60_000), []);
  });
});

describe('makeConsumerRetryCheck', () => {
  test('consumer_retrying con el detalle solo si un evento supera el umbral', async () => {
    let now = 0;
    const monitor = makeRetryMonitor(() => now);
    const check = makeConsumerRetryCheck(monitor, 60_000);
    monitor.retrying(event('e1'));
    assert.deepEqual(await check(), {});
    now = 61_000;
    assert.deepEqual(await check(), {
      issue: 'consumer_retrying', details: { events: [{ eventId: 'e1', type: 'iam.UserDeleted', retryingSeconds: 61 }] },
    });
  });
});

describe('withRetry con monitor', () => {
  const quiet = { sleep: async () => undefined, log: () => undefined };

  test('mientras falla el evento queda registrado; al lograrlo se libera', async () => {
    const monitor = makeRetryMonitor(() => 0);
    let calls = 0;
    const seenWhileRetrying: number[] = [];
    const handler = withRetry(async () => {
      seenWhileRetrying.push(monitor.stuck(-1).length);
      if (++calls < 3) throw new Error('bd caida');
    }, { ...quiet, attempts: Infinity, monitor });

    await handler(event('e1'));
    assert.deepEqual(seenWhileRetrying, [0, 1, 1]);
    assert.deepEqual(monitor.stuck(-1), []);
  });

  test('al rendirse (intentos agotados o payload invalido) tambien se libera', async () => {
    const monitor = makeRetryMonitor(() => 0);
    const failing = withRetry(async () => { throw new Error('siempre'); }, { ...quiet, attempts: 3, monitor });
    await assert.rejects(failing(event('e1')), /siempre/);
    const invalid = withRetry(async () => { throw new InvalidEventPayloadError('mal'); }, { ...quiet, monitor });
    await assert.rejects(invalid(event('e2')), InvalidEventPayloadError);
    assert.deepEqual(monitor.stuck(-1), []);
  });
});
