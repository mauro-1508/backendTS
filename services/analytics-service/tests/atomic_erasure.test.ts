import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Pool } from 'pg';
import { UsageEvent } from '../src/domain/entity';
import { makePostgresUsageEventRepository } from '../src/adapters/outbound/postgres/usage_event_repository';

const event = (eventType: UsageEvent['eventType']): UsageEvent => ({
  eventId: 'test-event', userId: '7', sessionId: 'test-session', section: 'HOME',
  eventType, referenceType: 'USER', referenceId: '7', signCodes: [],
  createdAt: new Date('2020-01-01T00:00:00Z'),
});

for (const eventType of ['USER_REGISTERED', 'TRANSLATION_COMPLETED', 'SECTION_VIEW'] as const) {
  it(`save comprueba la marca bajo el bloqueo: ${eventType}`, async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        return { rows: sql.includes('FROM erased_users') ? [{}] : [], rowCount: 1 };
      },
      release: () => {},
    };
    const repository = makePostgresUsageEventRepository({ connect: async () => client } as unknown as Pool);
    if (eventType === 'SECTION_VIEW') {
      await assert.rejects(repository.save(event(eventType)), { code: 'ACCOUNT_DELETED' });
      assert.equal(queries.at(-1)?.sql, 'ROLLBACK');
    } else {
      assert.equal(await repository.save(event(eventType)), eventType !== 'USER_REGISTERED');
      assert.equal(queries.at(-1)?.sql, 'COMMIT');
    }
    assert.match(queries[1].sql, /pg_advisory_xact_lock/);
    assert.match(queries[2].sql, /FROM erased_users/);
    const insert = queries.find(q => q.sql.includes('INSERT INTO usage_event'));
    if (eventType === 'TRANSLATION_COMPLETED') {
      assert.deepEqual(insert?.values?.slice(1, 3), [null, null]);
      assert.deepEqual(insert?.values?.slice(5, 7), [null, null]);
    } else {
      assert.equal(insert, undefined);
    }
  });
}
