import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Pool } from 'pg';
import { makePostgresOutboxRepository } from '../../src/shared/adapters/outbound/postgres/outbox_repository';

it('los resultados de una reserva vieja no pueden alterar una reserva nueva', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = { query: async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    return { rows: [], rowCount: 0 };
  } } as unknown as Pool;
  const repository = makePostgresOutboxRepository(pool);
  const token = '00000000-0000-4000-8000-000000000001';
  await repository.markPublished('event', token);
  assert.equal(await repository.markFailed('event', 'retry', 1000, token), 0);
  await repository.release(['event'], token);
  for (const call of calls) {
    assert.match(call.sql, /claim_token = \$[24]::uuid/);
    assert.ok(call.values?.includes(token));
    assert.match(call.sql, /published_at IS NULL/);
  }
});

it('claim devuelve el token y la fecha persistida para todos los reintentos', async () => {
  let claimToken: unknown;
  const pool = { query: async (sql: string, values: unknown[]) => {
    claimToken = values[2];
    assert.match(sql, /FOR UPDATE SKIP LOCKED/);
    return { rows: [{ event_id: 'event', type: 'iam.UserDeleted', payload: { userId: 7 },
      attempts: 0, claim_token: claimToken, created_at: new Date('2020-01-01T00:00:00Z') }] };
  } } as unknown as Pool;
  const [event] = await makePostgresOutboxRepository(pool).claimBatch(1, 1000);
  assert.equal(event.claimToken, claimToken);
  assert.equal(event.occurredAt, '2020-01-01T00:00:00.000Z');
});
