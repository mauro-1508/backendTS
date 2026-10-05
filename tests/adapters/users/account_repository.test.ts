import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries: string[] = [];
let failOn: RegExp | null = null;
let adminRows: Array<{ user_id: number }> = [];
let userRows: Array<unknown> = [{}];

const client = {
  query: vi.fn(async (sql: string) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    queries.push(q);
    if (failOn && failOn.test(q)) throw new Error('fallo simulado');
    if (/^SELECT 1 FROM public\.users/.test(q)) return { rows: userRows };
    if (/FROM public\.user_roles ur JOIN/.test(q)) return { rows: adminRows };
    return { rows: [], rowCount: 1 };
  }),
  release: vi.fn(),
};

vi.mock('../../../src/shared/database/postgres', () => ({
  pool: { connect: vi.fn(async () => client), query: vi.fn() },
}));

import { postgresAccountRepository } from '../../../src/domains/users/adapters/outbound/postgres/account_repository';

beforeEach(() => {
  queries.length = 0;
  failOn = null;
  adminRows = [{ user_id: 99 }, { user_id: 100 }];
  userRows = [{}];
  client.release.mockClear();
});

describe('postgresAccountRepository.erase', () => {
  it('borra todo en UNA transaccion y anonimiza usage_events', async () => {
    await expect(postgresAccountRepository.erase(7)).resolves.toBe('erased');
    expect(queries[0]).toBe('BEGIN');
    expect(queries.at(-1)).toBe('COMMIT');
    expect(queries.filter((q) => q === 'BEGIN' || q === 'COMMIT')).toHaveLength(2);
    const body = queries.join('\n');
    expect(body).toMatch(/DELETE FROM public\.translations WHERE user_id = \$1/);
    expect(body).toMatch(/DELETE FROM public\.user_tokens WHERE user_id = \$1/);
    expect(body).toMatch(/DELETE FROM public\.user_roles WHERE user_id = \$1/);
    expect(body).toMatch(/UPDATE public\.usage_events SET user_id = NULL WHERE user_id = \$1/);
    expect(body).toMatch(/reference_type = 'USER' AND reference_id = \$1/);
    expect(queries.at(-2)).toBe('DELETE FROM public.users WHERE user_id = $1');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('ROLLBACK y error si falla un paso a medias; nunca COMMIT', async () => {
    failOn = /^DELETE FROM public\.user_roles/;
    await expect(postgresAccountRepository.erase(7)).rejects.toThrow('fallo simulado');
    expect(queries).toContain('ROLLBACK');
    expect(queries).not.toContain('COMMIT');
    expect(queries.join('\n')).not.toMatch(/DELETE FROM public\.users/);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('ROLLBACK si falla el ultimo paso (DELETE users) tras haber borrado lo anterior', async () => {
    failOn = /^DELETE FROM public\.users/;
    await expect(postgresAccountRepository.erase(7)).rejects.toThrow('fallo simulado');
    expect(queries.at(-1)).toBe('ROLLBACK');
    expect(queries).not.toContain('COMMIT');
  });

  it('last_admin bajo bloqueo: ROLLBACK sin borrar nada', async () => {
    adminRows = [{ user_id: 7 }];
    await expect(postgresAccountRepository.erase(7)).resolves.toBe('last_admin');
    expect(queries.at(-1)).toBe('ROLLBACK');
    expect(queries.join('\n')).not.toMatch(/DELETE/);
  });

  it('un ADMIN con otro ADMIN presente si se puede borrar', async () => {
    adminRows = [{ user_id: 7 }, { user_id: 8 }];
    await expect(postgresAccountRepository.erase(7)).resolves.toBe('erased');
  });

  it('not_found si la fila ya no existe', async () => {
    userRows = [];
    await expect(postgresAccountRepository.erase(7)).resolves.toBe('not_found');
    expect(queries.at(-1)).toBe('ROLLBACK');
  });
});

describe('postgresAccountRepository.changePassword', () => {
  it('guarda el hash y revoca los PASSWORD_RESET pendientes en una transaccion', async () => {
    await postgresAccountRepository.changePassword(7, 'hash');
    expect(queries[0]).toBe('BEGIN');
    expect(queries.join('\n')).toMatch(/UPDATE public\.users SET password = \$1 WHERE user_id = \$2/);
    expect(queries.join('\n')).toMatch(/UPDATE public\.user_tokens SET revoked_at = NOW\(\) WHERE user_id = \$1 AND token_type = 'PASSWORD_RESET' AND used_at IS NULL AND revoked_at IS NULL/);
    expect(queries.at(-1)).toBe('COMMIT');
  });

  it('ROLLBACK si falla la revocacion de tokens (la clave no queda cambiada)', async () => {
    failOn = /^UPDATE public\.user_tokens/;
    await expect(postgresAccountRepository.changePassword(7, 'hash')).rejects.toThrow();
    expect(queries.at(-1)).toBe('ROLLBACK');
    expect(queries).not.toContain('COMMIT');
  });
});
