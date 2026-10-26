import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { makePostgresOutboxMonitor } from '../../src/shared/adapters/outbound/postgres/outbox_repository';
import { DEFAULT_OUTBOX_STUCK_AFTER_MS, makeOutboxHealthCheck } from '../../src/shared/application/outbox_health';

const NOW = new Date('2026-10-26T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const checkWith = (pending: number, oldestPendingAt: Date | null) =>
  makeOutboxHealthCheck({ monitor: { pendingSummary: async () => ({ pending, oldestPendingAt }) }, now: () => NOW });

describe('makeOutboxHealthCheck', () => {
  test('el umbral por defecto es 10 minutos', () => {
    assert.equal(DEFAULT_OUTBOX_STUCK_AFTER_MS, 600_000);
  });

  test('sin pendientes, o con eventos recientes, no hay issue', async () => {
    assert.deepEqual(await checkWith(0, null)(), {});
    assert.deepEqual(await checkWith(10, minutesAgo(9))(), {});
  });

  test('un evento sin publicar hace mas de 10 minutos: outbox_backlog con el detalle', async () => {
    assert.deepEqual(await checkWith(3, minutesAgo(11))(), {
      issue: 'outbox_backlog', details: { pending: 3, oldestPendingSeconds: 660 },
    });
  });

  test('el umbral se puede cambiar', async () => {
    const check = makeOutboxHealthCheck({
      monitor: { pendingSummary: async () => ({ pending: 1, oldestPendingAt: minutesAgo(2) }) },
      stuckAfterMs: 60_000,
      now: () => NOW,
    });
    assert.equal((await check()).issue, 'outbox_backlog');
  });
});

describe('makePostgresOutboxMonitor', () => {
  test('cuenta solo los no publicados y devuelve el mas viejo; sin filas da 0 y null', async () => {
    const sqls: string[] = [];
    let rows: unknown[] = [{ pending: 2, oldest: minutesAgo(15) }];
    const pool = { query: async (sql: string) => { sqls.push(sql); return { rows }; } } as unknown as Pool;
    const monitor = makePostgresOutboxMonitor(pool);

    assert.deepEqual(await monitor.pendingSummary(), { pending: 2, oldestPendingAt: minutesAgo(15) });
    assert.match(sqls[0], /COUNT\(\*\)::int AS pending, MIN\(created_at\) AS oldest/);
    assert.match(sqls[0], /WHERE published_at IS NULL/);

    rows = [];
    assert.deepEqual(await monitor.pendingSummary(), { pending: 0, oldestPendingAt: null });
  });
});
