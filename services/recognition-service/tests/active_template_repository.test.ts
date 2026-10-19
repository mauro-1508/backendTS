import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Pool } from 'pg';
import { AccountErasedError } from '../src/common/domain/errors';
import { makePostgresSignTemplateRepository } from '../src/ia/adapters/outbound/postgres/sign_template_repository';

for (const erased of [true, false]) {
  for (const operation of ['create', 'remove']) {
    it(`plantillas ${operation} usa una conexión y verifica borrado=${erased}`, async () => {
      const queries: string[] = [];
      let connects = 0;
      const client = {
        query: async (sql: string) => {
          queries.push(sql);
          if (sql.includes('FROM public.erased_users')) return { rows: erased ? [{}] : [] };
          return { rows: sql.includes('RETURNING') ? [{ template_id: 1, label: 'TEST', kind: 'static',
            features: [[0]], source: 'manual', created_by: 7, created_at: new Date('2020-01-01T00:00:00Z') }] : [] };
        },
        release: () => {},
      };
      const repository = makePostgresSignTemplateRepository({
        connect: async () => { connects++; return client; },
        query: async () => { assert.fail('No debe usar otra conexión fuera de la transacción'); },
      } as unknown as Pool);
      const run = () => operation === 'create'
        ? repository.createMany([{ label: 'TEST', kind: 'static', features: [[0]] }], 7)
        : repository.remove(1, 7);
      if (erased) await assert.rejects(run(), AccountErasedError); else await run();
      assert.equal(connects, 1);
      assert.match(queries[1], /pg_advisory_xact_lock/);
      assert.equal(queries.some(sql => sql.includes('RETURNING')), !erased);
    });
  }
}
