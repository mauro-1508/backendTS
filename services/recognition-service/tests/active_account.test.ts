import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Pool } from 'pg';
import { withActiveAccount } from '../src/accounts/active_account';
import { AccountErasedError } from '../src/translations/domain/service';

for (const erased of [false, true]) {
  it(`protege la escritura externa y libera el bloqueo: erased=${erased}`, async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rows: erased && sql.includes('FROM public.erased_users') ? [{}] : [] };
      },
      release: () => calls.push('release'),
    };
    const pool = { connect: async () => client } as unknown as Pool;
    const write = () => withActiveAccount(pool, 7, async () => { calls.push('mongo-write'); });
    if (erased) await assert.rejects(write(), AccountErasedError);
    else await write();
    assert.equal(calls[0], 'BEGIN');
    assert.match(calls[1], /pg_advisory_xact_lock/);
    assert.match(calls[2], /FROM public.erased_users/);
    assert.equal(calls.includes('mongo-write'), !erased);
    assert.equal(calls.at(-2), erased ? 'ROLLBACK' : 'COMMIT');
    assert.equal(calls.at(-1), 'release');
  });
}

it('el decorador de muestras no escribe Mongo si la marca ya existe', async () => {
  const { makeActiveSampleRepository } = await import('../src/accounts/active_sample_repository');
  const { InMemorySampleRepository } = await import('../src/samples/adapters/outbound/memory/in_memory_sample_repository');
  const repository = new InMemorySampleRepository();
  const pool = { connect: async () => ({
    query: async (sql: string) => ({ rows: sql.includes('FROM public.erased_users') ? [{}] : [] }),
    release: () => {},
  }) } as unknown as Pool;
  const guarded = makeActiveSampleRepository(pool, repository);
  await assert.rejects(guarded.create({
    signCode: 'TEST', captureSessionId: 'test-session', recordedBy: 7, performedBy: 'Test',
    consentGrantedAt: new Date('2020-01-01T00:00:00Z'), consentTermsVersion: 'test', frames: [[0]],
  }), AccountErasedError);
  assert.deepEqual(await repository.list({}), []);
});
