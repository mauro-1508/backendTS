import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { makePostgresAccountRepository } from '../../../src/users/adapters/outbound/postgres/account_repository';

const queries: string[] = [];
let failOn: RegExp | null = null;
let adminRows: Array<{ user_id: number }> = [];
let userRows: Array<unknown> = [{}];

const client = {
  query: mock.fn(async (sql: string) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    queries.push(q);
    if (failOn && failOn.test(q)) throw new Error('fallo simulado');
    if (/^SELECT 1 FROM public\.users/.test(q)) return { rows: userRows };
    if (/FROM public\.user_roles ur JOIN/.test(q)) return { rows: adminRows };
    return { rows: [], rowCount: 1 };
  }),
  release: mock.fn(() => undefined),
};
const pool = { connect: async () => client, query: async () => ({ rows: [] }) } as unknown as Pool;
const repository = makePostgresAccountRepository(pool);

beforeEach(() => {
  queries.length = 0;
  failOn = null;
  adminRows = [{ user_id: 99 }, { user_id: 100 }];
  userRows = [{}];
  client.release.mock.resetCalls();
});

describe('postgresAccountRepository.erase', () => {
  test('borra todo en UNA transaccion y anonimiza usage_events', async () => {
    assert.equal(await repository.erase(7), 'erased');
    assert.equal(queries[0], 'BEGIN');
    assert.equal(queries.at(-1), 'COMMIT');
    assert.equal(queries.filter((q) => q === 'BEGIN' || q === 'COMMIT').length, 2);
    const body = queries.join('\n');
    assert.match(body, /DELETE FROM public\.translations WHERE user_id = \$1/);
    assert.match(body, /DELETE FROM public\.user_tokens WHERE user_id = \$1/);
    assert.match(body, /DELETE FROM public\.user_roles WHERE user_id = \$1/);
    assert.match(body, /UPDATE public\.usage_events SET user_id = NULL WHERE user_id = \$1/);
    assert.match(body, /reference_type = 'USER' AND reference_id = \$1/);
    assert.equal(queries.at(-2), 'DELETE FROM public.users WHERE user_id = $1');
    assert.equal(client.release.mock.callCount(), 1);
  });

  test('ROLLBACK y error si falla un paso a medias; nunca COMMIT', async () => {
    failOn = /^DELETE FROM public\.user_roles/;
    await assert.rejects(repository.erase(7), /fallo simulado/);
    assert.ok(queries.includes('ROLLBACK'));
    assert.ok(!queries.includes('COMMIT'));
    assert.doesNotMatch(queries.join('\n'), /DELETE FROM public\.users/);
    assert.equal(client.release.mock.callCount(), 1);
  });

  test('ROLLBACK si falla el ultimo paso (DELETE users) tras haber borrado lo anterior', async () => {
    failOn = /^DELETE FROM public\.users/;
    await assert.rejects(repository.erase(7), /fallo simulado/);
    assert.equal(queries.at(-1), 'ROLLBACK');
    assert.ok(!queries.includes('COMMIT'));
  });

  test('last_admin bajo bloqueo: ROLLBACK sin borrar nada', async () => {
    adminRows = [{ user_id: 7 }];
    assert.equal(await repository.erase(7), 'last_admin');
    assert.equal(queries.at(-1), 'ROLLBACK');
    assert.doesNotMatch(queries.join('\n'), /DELETE/);
  });

  test('un ADMIN con otro ADMIN presente si se puede borrar', async () => {
    adminRows = [{ user_id: 7 }, { user_id: 8 }];
    assert.equal(await repository.erase(7), 'erased');
  });

  test('not_found si la fila ya no existe', async () => {
    userRows = [];
    assert.equal(await repository.erase(7), 'not_found');
    assert.equal(queries.at(-1), 'ROLLBACK');
  });
});

describe('postgresAccountRepository.changePassword', () => {
  test('guarda el hash y revoca los PASSWORD_RESET pendientes en una transaccion', async () => {
    await repository.changePassword(7, 'hash');
    assert.equal(queries[0], 'BEGIN');
    assert.match(queries.join('\n'), /UPDATE public\.users SET password = \$1 WHERE user_id = \$2/);
    assert.match(queries.join('\n'), /UPDATE public\.user_tokens SET revoked_at = NOW\(\) WHERE user_id = \$1 AND token_type = 'PASSWORD_RESET' AND used_at IS NULL AND revoked_at IS NULL/);
    assert.equal(queries.at(-1), 'COMMIT');
  });

  test('ROLLBACK si falla la revocacion de tokens (la clave no queda cambiada)', async () => {
    failOn = /^UPDATE public\.user_tokens/;
    await assert.rejects(repository.changePassword(7, 'hash'));
    assert.equal(queries.at(-1), 'ROLLBACK');
    assert.ok(!queries.includes('COMMIT'));
  });
});
