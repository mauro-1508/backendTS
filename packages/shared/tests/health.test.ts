import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Request, Response } from 'express';
import { makeServiceHealthHandler } from '../src/http/health';
import { makeDeadLetterCheck } from '../src/events/dead_letter_check';
import { InMemoryEventBus } from '../src/events/in_memory_event_bus';

const callHealth = async (handler: ReturnType<typeof makeServiceHealthHandler>) => {
  let status = 200;
  let body: unknown;
  const res = {
    status(code: number) { status = code; return this; },
    json(payload: unknown) { body = payload; return this; },
  } as unknown as Response;
  await handler({} as Request, res, () => undefined);
  return { status, body };
};

describe('makeServiceHealthHandler', () => {
  test('sin comprobaciones, o si todas pasan: 200 { status: ok, service }', async () => {
    assert.deepEqual(await callHealth(makeServiceHealthHandler('svc')), { status: 200, body: { status: 'ok', service: 'svc' } });
    const passing = makeServiceHealthHandler('svc', { outbox: async () => ({}) });
    assert.deepEqual((await callHealth(passing)).body, { status: 'ok', service: 'svc' });
  });

  test('una comprobacion con issue: sigue en 200, degraded con issues y details', async () => {
    const handler = makeServiceHealthHandler('svc', {
      outbox: async () => ({ issue: 'outbox_backlog', details: { pending: 3 } }),
      dead_letters: async () => ({}),
    });
    assert.deepEqual(await callHealth(handler), {
      status: 200,
      body: { status: 'degraded', service: 'svc', issues: ['outbox_backlog'], details: { outbox: { pending: 3 } } },
    });
  });

  test('una comprobacion que falla o tarda cuenta como <nombre>_unavailable', async () => {
    const handler = makeServiceHealthHandler('svc', {
      dead_letters: async () => { throw new Error('sin broker'); },
      outbox: () => new Promise(() => {}),
    }, 20);
    const { status, body } = await callHealth(handler);
    assert.equal(status, 200);
    assert.deepEqual((body as { issues: string[] }).issues, ['dead_letters_unavailable', 'outbox_unavailable']);
  });
});

describe('makeDeadLetterCheck', () => {
  test('dead_letters solo con las colas que tienen mensajes', async () => {
    const check = makeDeadLetterCheck({ deadLetterCounts: async () => ({ 'a.user-deleted': 2, 'a.other': 0 }) });
    assert.deepEqual(await check(), { issue: 'dead_letters', details: { 'a.user-deleted': 2 } });
  });

  test('sin mensajes muertos no hay issue; el bus en memoria nunca tiene', async () => {
    assert.deepEqual(await makeDeadLetterCheck({ deadLetterCounts: async () => ({ a: 0 }) })(), {});
    assert.deepEqual(await makeDeadLetterCheck(new InMemoryEventBus())(), {});
  });
});
