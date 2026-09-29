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

  it('bloquea users antes de user_tokens: FOR UPDATE, UPDATE user_tokens, UPDATE users, COMMIT', async () => {
    await expect(postgresAuthRepository.consumeAndResetPassword(1, 7, 'hash')).resolves.toBe(true);
    expect(queries).toHaveLength(5);
    expect(queries[0]).toBe('BEGIN');
    expect(queries[1]).toMatch(/^SELECT 1 FROM public\.users WHERE user_id = \$1 FOR UPDATE$/);
    expect(queries[2]).toMatch(/^UPDATE public\.user_tokens SET used_at/);
    expect(queries[3]).toMatch(/^UPDATE public\.users SET password/);
    expect(queries[4]).toBe('COMMIT');
  });
});
