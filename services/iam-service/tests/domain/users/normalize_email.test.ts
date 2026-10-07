import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { normalizeEmail } from '../../../src/users/domain/service';
import { makePostgresUserRepository } from '../../../src/users/adapters/outbound/postgres/user_repository';

const rows = [{ user_id: 1, name: 'Ana', email: 'ana@x.com', password: null, terms_accepted: true, terms_accepted_at: null, created_at: new Date() }];
const calls: Array<{ sql: string; params: unknown[] }> = [];
// Pool falso: el INSERT devuelve la fila con el correo recibido; el SELECT filtra por correo.
const pool = {
  query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return { rows: sql.includes('INSERT') ? [{ ...rows[0], email: params[1] }] : rows.filter((r) => r.email === params[0]) };
  },
} as unknown as Pool;
const repository = makePostgresUserRepository(pool);

describe('normalizeEmail', () => {
  test('recorta y pasa a minusculas', () => {
    assert.equal(normalizeEmail('  Ana@X.COM '), 'ana@x.com');
  });
});

describe('postgresUserRepository con correo normalizado', () => {
  test('encuentra ana@x.com buscando ANA@X.COM', async () => {
    const user = await repository.findByEmail(' ANA@X.COM ');
    assert.equal(user?.userId, 1);
  });

  test('create guarda el correo normalizado', async () => {
    await repository.create({ name: 'Bea', email: 'Bea@X.com', password: 'h' });
    assert.deepEqual(calls.at(-1)!.params, ['Bea', 'bea@x.com', 'h', 'INACTIVE', null]);
  });

  test('un correo inexistente devuelve null', async () => {
    assert.equal(await repository.findByEmail('nadie@x.com'), null);
  });
});
