import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { makePostgresAuthRepository } from '../../../src/auth/adapters/outbound/postgres/auth_repository';

const queries: string[] = [];
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();

const defaultQuery = async (sql: string) => {
  queries.push(normalize(sql));
  return { rows: [], rowCount: 1 };
};
const client = { query: mock.fn(defaultQuery), release: mock.fn(() => undefined) };
// Pool falso: solo connect() devuelve el cliente transaccional.
const pool = { connect: async () => client, query: mock.fn(async () => ({ rows: [] })) } as unknown as Pool;
const repository = makePostgresAuthRepository(pool);

beforeEach(() => {
  queries.length = 0;
  client.query.mock.resetCalls();
  client.query.mock.mockImplementation(defaultQuery);
});

describe('postgresAuthRepository.consumeAndResetPassword', () => {
  test('bloquea users antes de user_tokens: FOR UPDATE, UPDATE user_tokens, UPDATE users (activa INACTIVE), revoca EMAIL_VERIFICATION, COMMIT', async () => {
    assert.equal(await repository.consumeAndResetPassword(1, 7, 'hash'), true);
    assert.equal(queries.length, 6);
    assert.equal(queries[0], 'BEGIN');
    assert.match(queries[1], /^SELECT 1 FROM public\.users WHERE user_id = \$1 FOR UPDATE$/);
    assert.match(queries[2], /^UPDATE public\.user_tokens SET used_at/);
    assert.match(queries[3], /^UPDATE public\.users SET password = \$1, status = CASE WHEN status = 'INACTIVE' THEN 'ACTIVE'.*email_verified_at = CASE WHEN status = 'INACTIVE' THEN NOW\(\)/);
    assert.match(queries[4], /^UPDATE public\.user_tokens SET revoked_at = NOW\(\) WHERE user_id = \$1 AND token_type = 'EMAIL_VERIFICATION'/);
    assert.equal(queries[5], 'COMMIT');
  });

  test('libera la conexion al terminar', async () => {
    client.release.mock.resetCalls();
    await repository.consumeAndResetPassword(1, 7, 'hash');
    assert.equal(client.release.mock.callCount(), 1);
  });
});

describe('postgresAuthRepository.consumeAndActivate', () => {
  test('bloquea users antes de user_tokens y activa solo desde INACTIVE', async () => {
    assert.equal(await repository.consumeAndActivate(1, 7), true);
    assert.equal(queries.length, 5);
    assert.equal(queries[0], 'BEGIN');
    assert.match(queries[1], /^SELECT 1 FROM public\.users WHERE user_id = \$1 FOR UPDATE$/);
    assert.match(queries[2], /^UPDATE public\.user_tokens SET used_at .*used_at IS NULL AND revoked_at IS NULL/);
    assert.match(queries[3], /^UPDATE public\.users SET status = 'ACTIVE', email_verified_at = NOW\(\) WHERE user_id = \$1 AND status = 'INACTIVE'$/);
    assert.equal(queries[4], 'COMMIT');
  });

  test('token ya consumido: false y no toca users', async () => {
    client.query.mock.mockImplementation(async (sql: string) => {
      queries.push(normalize(sql));
      return { rows: [], rowCount: /UPDATE public\.user_tokens/.test(sql) ? 0 : 1 };
    });
    assert.equal(await repository.consumeAndActivate(1, 7), false);
    assert.equal(queries.some((q) => q.startsWith('UPDATE public.users')), false);
  });
});
