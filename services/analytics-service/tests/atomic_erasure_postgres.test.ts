import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { it } from 'node:test';
import { withIsolatedPostgres } from '../../../tests/helpers/isolated_postgres';
import { makePostgresUsageEventRepository } from '../src/adapters/outbound/postgres/usage_event_repository';

for (const deletionFirst of [true, false]) {
  it(`Analytics serializa save con borrado primero=${deletionFirst}`, {
    skip: !process.env.PROFILE_TEST_DATABASE_URL,
  }, async () => withIsolatedPostgres(async (first, second) => {
    for (const file of ['001_usage_event.sql', '002_erased_users.sql']) {
      await first.query(await readFile(resolve(__dirname, '../db', file), 'utf8'));
    }
    const client = await first.connect();
    const held = makePostgresUsageEventRepository({ connect: async () => ({
      query: (sql: string, values?: unknown[]) => sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
        ? Promise.resolve({ rows: [], rowCount: 0 }) : client.query(sql, values),
      release: () => {},
    }) } as never);
    const other = makePostgresUsageEventRepository(second);
    const save = (repository: typeof held) => repository.save({
      eventId: 'translation', userId: '7', sessionId: 'session', section: 'TRANSLATION',
      eventType: 'TRANSLATION_COMPLETED', referenceType: 'TRANSLATION', referenceId: '1',
      signCodes: ['TEST'], createdAt: new Date('2020-01-01T00:00:00Z'),
    });
    let pending: Promise<unknown> | undefined;
    try {
      await client.query('BEGIN');
      const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      if (deletionFirst) await held.unlinkUser('7'); else await save(held);
      pending = deletionFirst ? save(other) : other.unlinkUser('7');
      // Captura fallos mientras se observa que el otro backend realmente espera el lock.
      pending.catch(() => {});
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const { rows } = await client.query('SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked', [pid]);
        if (rows[0].blocked) { blocked = true; break; }
        await delay(20);
      }
      assert.equal(blocked, true);
      await client.query('COMMIT');
      await pending;
      assert.deepEqual((await second.query('SELECT user_id, session_id FROM usage_event')).rows,
        [{ user_id: null, session_id: null }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pending;
    }
  }));
}
