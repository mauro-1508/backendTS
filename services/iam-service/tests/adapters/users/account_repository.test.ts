import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { makePostgresAccountRepository } from '../../../src/users/adapters/outbound/postgres/account_repository';

const queries: string[] = [];
let failOn: RegExp | null = null;
let adminRows: Array<{ user_id: number }> = [];
let userRows: Array<unknown> = [{}];
let legacyTable: string | null = null;
const params: Array<unknown[] | undefined> = [];

const client = {
  query: mock.fn(async (sql: string, p?: unknown[]) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    queries.push(q);
    params.push(p);
    if (failOn && failOn.test(q)) throw new Error('fallo simulado');
    if (/to_regclass/.test(q)) return { rows: [{ table_name: legacyTable && q.includes(`'public.${legacyTable}'`) ? legacyTable : null }] };
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
  params.length = 0;
  legacyTable = null;
  failOn = null;
  adminRows = [{ user_id: 99 }, { user_id: 100 }];
  userRows = [{}];
  client.release.mock.resetCalls();
});

describe('postgresAccountRepository.erase', () => {
  test('borra lo de iam y deja UserDeleted en el outbox en UNA transaccion', async () => {
    assert.equal(await repository.erase(7), 'erased');
    assert.equal(queries[0], 'BEGIN');
    assert.equal(queries.at(-1), 'COMMIT');
    assert.equal(queries.filter((q) => q === 'BEGIN' || q === 'COMMIT').length, 2);
    const body = queries.join('\n');
    assert.doesNotMatch(body, /translations|usage_event/);
    assert.match(body, /DELETE FROM public\.user_tokens WHERE user_id = \$1/);
    assert.match(body, /DELETE FROM public\.user_roles WHERE user_id = \$1/);
    assert.doesNotMatch(body, /DELETE FROM public\.user_role WHERE/);
    const outboxAt = queries.findIndex((q) => q.startsWith('INSERT INTO public.outbox_events'));
    assert.ok(outboxAt > 0);
    const [type, payload] = params[outboxAt] as [string, string];
    assert.equal(type, 'iam.UserDeleted');
    const event = JSON.parse(payload);
    assert.deepEqual(Object.keys(event).sort(), ['occurredAt', 'userId']);
    assert.equal(event.userId, 7);
    assert.equal(queries.at(-2), 'DELETE FROM public.users WHERE user_id = $1');
    assert.ok(outboxAt < queries.length - 2);
    assert.equal(client.release.mock.callCount(), 1);
  });

  test('borra la tabla antigua user_role solo si existe', async () => {
    legacyTable = 'user_role';
    await repository.erase(7);
    assert.match(queries.join('\n'), /DELETE FROM public\.user_role WHERE user_id = \$1/);
  });

  test('si falla el INSERT del outbox, ROLLBACK: la cuenta no se borra sin evento', async () => {
    failOn = /^INSERT INTO public\.outbox_events/;
    await assert.rejects(repository.erase(7), /fallo simulado/);
    assert.ok(!queries.includes('COMMIT'));
    assert.doesNotMatch(queries.join('\n'), /DELETE FROM public\.users/);
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

for (const table of ['user_auth', 'user_session', 'password_reset_token']) {
  test(`erase elimina la dependencia legacy ${table} cuando existe`, async () => {
    legacyTable = table;
    await repository.erase(7);
    assert.ok(queries.includes(`DELETE FROM public.${table} WHERE user_id = $1`));
    assert.equal(queries.at(-1), 'COMMIT');
  });
}
