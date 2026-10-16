import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PublishTimeoutError } from '@traduce/shared';
import { makeRelayOutbox, outboxRetryDelayMs } from '../../src/shared/application/relay_outbox';
import { startOutboxRelayLoop } from '../../src/shared/application/run_outbox_relay';
import { OutboxEvent, OutboxRepository } from '../../src/shared/ports/outbox_repository';

interface Row extends OutboxEvent {
  createdAt: Date;
  publishedAt: Date | null;
  lastError: string | null;
  nextAttemptAt: number;
  claimed: boolean;
}

/** Repo en memoria con la misma semantica: reserva, backoff (reloj falso) y purga. */
const makeFakeRepo = (rows: Row[], clock: { now: number } = { now: 0 }): OutboxRepository & { retryDelays: number[] } => ({
  retryDelays: [],
  async claimBatch(limit) {
    const due = rows.filter(r => r.publishedAt === null && !r.claimed && r.nextAttemptAt <= clock.now).slice(0, limit);
    due.forEach(r => { r.claimed = true; });
    return due.map(({ eventId, type, payload, attempts }) => ({ eventId, type, payload, attempts }));
  },
  async markPublished(id) {
    const row = rows.find(r => r.eventId === id)!;
    row.publishedAt = new Date(clock.now);
    row.claimed = false;
  },
  async markFailed(id, error, retryAfterMs) {
    const row = rows.find(r => r.eventId === id)!;
    row.attempts++;
    row.lastError = error;
    row.claimed = false;
    row.nextAttemptAt = clock.now + retryAfterMs;
    this.retryDelays.push(retryAfterMs);
    return row.attempts;
  },
  async release(ids) { rows.filter(r => ids.includes(r.eventId)).forEach(r => { r.claimed = false; }); },
  async purgePublishedBefore(before) {
    const old = rows.filter(r => r.publishedAt && r.publishedAt < before);
    old.forEach(r => rows.splice(rows.indexOf(r), 1));
    return old.length;
  },
});

const row = (eventId: string): Row => ({
  eventId, type: 'iam.UserDeleted', payload: { userId: 7, occurredAt: '2026-10-01T10:00:00.000Z' },
  attempts: 0, createdAt: new Date(0), publishedAt: null, lastError: null, nextAttemptAt: 0, claimed: false,
});

describe('relayOutbox', () => {
  test('publica con el eventId del outbox, como mandatory, y lo marca publicado', async () => {
    const rows = [row('e1')];
    const sent: Array<{ type: string; eventId?: string; mandatory?: boolean }> = [];
    const relay = makeRelayOutbox({
      repository: makeFakeRepo(rows),
      publisher: { publish: async (type, _p, options) => { sent.push({ type, ...options }); } },
    });
    assert.deepEqual(await relay(), { published: 1, failed: 0 });
    assert.deepEqual(sent, [{ type: 'iam.UserDeleted', eventId: 'e1', mandatory: true }]);
    assert.ok(rows[0].publishedAt);
  });

  test('si publish falla una vez: attempts++, last_error, backoff; el reintento (ya vencido) usa el mismo id', async () => {
    const rows = [row('e1')];
    const clock = { now: 0 };
    let calls = 0;
    const ids: Array<string | undefined> = [];
    const relay = makeRelayOutbox({
      repository: makeFakeRepo(rows, clock),
      publisher: {
        publish: async (_t, _p, options) => {
          ids.push(options?.eventId);
          if (calls++ === 0) throw new Error('sin ruta');
        },
      },
    });
    assert.deepEqual(await relay(), { published: 0, failed: 1 });
    assert.equal(rows[0].attempts, 1);
    assert.equal(rows[0].lastError, 'sin ruta');
    assert.equal(rows[0].publishedAt, null);

    // Aun no vence el backoff: no se reintenta.
    assert.deepEqual(await relay(), { published: 0, failed: 0 });
    clock.now = rows[0].nextAttemptAt;
    assert.deepEqual(await relay(), { published: 1, failed: 0 });
    assert.deepEqual(ids, ['e1', 'e1']);
  });

  test('el backoff es exponencial con tope', () => {
    assert.deepEqual([0, 1, 2, 3].map(n => outboxRetryDelayMs(n, 1000, 5000)), [1000, 2000, 4000, 5000]);
    assert.equal(outboxRetryDelayMs(30), 5 * 60_000);
  });

  test('un evento que falla no bloquea a los demas del lote', async () => {
    const rows = [row('malo'), row('bueno')];
    const relay = makeRelayOutbox({
      repository: makeFakeRepo(rows),
      publisher: { publish: async (_t, _p, o) => { if (o?.eventId === 'malo') throw new Error('x'); } },
    });
    assert.deepEqual(await relay(), { published: 1, failed: 1 });
    assert.notEqual(rows[1].publishedAt, null);
  });

  test('en el primer timeout corta la pasada y libera los reservados sin penalizarlos', async () => {
    const rows = [row('a'), row('b'), row('c')];
    const attempted: string[] = [];
    const relay = makeRelayOutbox({
      repository: makeFakeRepo(rows),
      publisher: {
        publish: async (_t, _p, o) => { attempted.push(o!.eventId!); throw new PublishTimeoutError('mudo'); },
      },
    });
    assert.deepEqual(await relay(), { published: 0, failed: 1 });
    assert.deepEqual(attempted, ['a']);
    assert.deepEqual(rows.map(r => r.attempts), [1, 0, 0]);
    assert.deepEqual(rows.map(r => r.claimed), [false, false, false]);
  });

  test('una sola alerta por evento: al alcanzar el umbral', async () => {
    const rows = [row('e1')];
    const clock = { now: 0 };
    const logs: string[] = [];
    const relay = makeRelayOutbox({
      repository: makeFakeRepo(rows, clock),
      publisher: { publish: async () => { throw new Error('nack'); } },
      alertAfterAttempts: 3,
      log: m => logs.push(m),
    });
    for (let i = 0; i < 5; i++) {
      await relay();
      clock.now = rows[0].nextAttemptAt;
    }
    assert.equal(rows[0].attempts, 5);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /ALERTA.*e1.*3 intentos/);
  });

  test('respeta el tamano del lote', async () => {
    const rows = [row('a'), row('b'), row('c')];
    const relay = makeRelayOutbox({
      repository: makeFakeRepo(rows), publisher: { publish: async () => {} }, batchSize: 2,
    });
    assert.deepEqual(await relay(), { published: 2, failed: 0 });
    assert.equal(rows[2].publishedAt, null);
  });

  test('cada N pasadas borra los publicados con mas de 7 dias', async () => {
    const day = 24 * 60 * 60 * 1000;
    const clock = { now: 10 * day };
    const rows = [row('viejo'), row('reciente'), row('pendiente')];
    rows[0].publishedAt = new Date(clock.now - 8 * day);
    rows[1].publishedAt = new Date(clock.now - 1 * day);
    rows[2].nextAttemptAt = clock.now + day; // pendiente pero no vencido
    const relay = makeRelayOutbox({
      repository: makeFakeRepo(rows, clock), publisher: { publish: async () => {} },
      purgeEveryPasses: 2, now: () => new Date(clock.now), log: () => {},
    });
    await relay();
    assert.equal(rows.length, 3);
    await relay();
    assert.deepEqual(rows.map(r => r.eventId), ['reciente', 'pendiente']);
  });
});

describe('startOutboxRelayLoop', () => {
  test('ejecuta el relay cada intervalo, sobrevive a errores, no se solapa y se detiene (sin tiempos reales)', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
      let calls = 0;
      let release: () => void = () => {};
      const errors: unknown[] = [];
      const loop = startOutboxRelayLoop(
        async () => {
          calls++;
          if (calls === 1) throw new Error('db caida');
          if (calls === 2) await new Promise<void>(resolve => { release = resolve; });
          return { published: 0, failed: 0 };
        },
        { intervalMs: 5000, log: (_m, e) => errors.push(e) },
      );
      const flush = () => new Promise<void>(resolve => setImmediate(resolve));

      mock.timers.tick(5000);
      await flush();
      assert.equal(calls, 1);
      assert.equal(errors.length, 1);

      mock.timers.tick(5000);
      await flush();
      assert.equal(calls, 2);
      mock.timers.tick(5000); // la pasada 2 sigue en curso: no se solapa
      await flush();
      assert.equal(calls, 2);

      release();
      await flush();
      mock.timers.tick(5000);
      await flush();
      assert.equal(calls, 3);

      loop.stop();
      mock.timers.tick(20000);
      await flush();
      assert.equal(calls, 3);
    } finally {
      mock.timers.reset();
    }
  });
});
