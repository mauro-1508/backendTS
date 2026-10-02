import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries: string[] = [];
const client = {
  query: vi.fn(async (sql: string) => {
    queries.push(sql.replace(/\s+/g, ' ').trim());
    return { rows: [], rowCount: 1 };
  }),
  release: vi.fn(),
};

vi.mock('../../../src/shared/database/postgres', () => ({
  pool: { connect: vi.fn(async () => client), query: vi.fn() },
}));

import { postgresAuthRepository } from '../../../src/domains/auth/adapters/outbound/postgres/auth_repository';

describe('postgresAuthRepository.consumeAndResetPassword', () => {
  beforeEach(() => {
    queries.length = 0;
    client.query.mockClear();
  });

  it('bloquea users antes de user_tokens: FOR UPDATE, UPDATE user_tokens, UPDATE users (activa INACTIVE), revoca EMAIL_VERIFICATION, COMMIT', async () => {
    await expect(postgresAuthRepository.consumeAndResetPassword(1, 7, 'hash')).resolves.toBe(true);
    expect(queries).toHaveLength(6);
    expect(queries[0]).toBe('BEGIN');
    expect(queries[1]).toMatch(/^SELECT 1 FROM public\.users WHERE user_id = \$1 FOR UPDATE$/);
    expect(queries[2]).toMatch(/^UPDATE public\.user_tokens SET used_at/);
    expect(queries[3]).toMatch(/^UPDATE public\.users SET password = \$1, status = CASE WHEN status = 'INACTIVE' THEN 'ACTIVE'.*email_verified_at = CASE WHEN status = 'INACTIVE' THEN NOW\(\)/);
    expect(queries[4]).toMatch(/^UPDATE public\.user_tokens SET revoked_at = NOW\(\) WHERE user_id = \$1 AND token_type = 'EMAIL_VERIFICATION'/);
    expect(queries[5]).toBe('COMMIT');
  });
});

describe('postgresAuthRepository.consumeAndActivate', () => {
  beforeEach(() => {
    queries.length = 0;
    client.query.mockClear();
  });

  it('bloquea users antes de user_tokens y activa solo desde INACTIVE', async () => {
    await expect(postgresAuthRepository.consumeAndActivate(1, 7)).resolves.toBe(true);
    expect(queries).toHaveLength(5);
    expect(queries[0]).toBe('BEGIN');
    expect(queries[1]).toMatch(/^SELECT 1 FROM public\.users WHERE user_id = \$1 FOR UPDATE$/);
    expect(queries[2]).toMatch(/^UPDATE public\.user_tokens SET used_at .*used_at IS NULL AND revoked_at IS NULL/);
    expect(queries[3]).toMatch(/^UPDATE public\.users SET status = 'ACTIVE', email_verified_at = NOW\(\) WHERE user_id = \$1 AND status = 'INACTIVE'$/);
    expect(queries[4]).toBe('COMMIT');
  });

  it('token ya consumido: false y no toca users', async () => {
    client.query.mockImplementation(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim());
      return { rows: [], rowCount: /UPDATE public\.user_tokens/.test(sql) ? 0 : 1 };
    });
    await expect(postgresAuthRepository.consumeAndActivate(1, 7)).resolves.toBe(false);
    expect(queries.some((q) => q.startsWith('UPDATE public.users'))).toBe(false);
  });
});
