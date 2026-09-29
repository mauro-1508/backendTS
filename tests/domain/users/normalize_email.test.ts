import { describe, expect, it, vi } from 'vitest';

const rows = [{ user_id: 1, name: 'Ana', email: 'ana@x.com', password: null, terms_accepted: true, terms_accepted_at: null, created_at: new Date() }];
const query = vi.fn(async (sql: string, params: unknown[]) => ({
  rows: sql.includes('INSERT') ? [{ ...rows[0], email: params[1] }] : rows.filter((r) => r.email === params[0]),
}));
vi.mock('../../../src/shared/database/postgres', () => ({ pool: { query: (sql: string, params: unknown[]) => query(sql, params) } }));

import { normalizeEmail } from '../../../src/domains/users/domain/service';
import { postgresUserRepository } from '../../../src/domains/users/adapters/outbound/postgres/user_repository';

describe('normalizeEmail', () => {
  it('recorta y pasa a minusculas', () => {
    expect(normalizeEmail('  Ana@X.COM ')).toBe('ana@x.com');
  });
});

describe('postgresUserRepository con correo normalizado', () => {
  it('encuentra ana@x.com buscando ANA@X.COM', async () => {
    const user = await postgresUserRepository.findByEmail(' ANA@X.COM ');
    expect(user?.userId).toBe(1);
  });

  it('create guarda el correo normalizado', async () => {
    await postgresUserRepository.create({ name: 'Bea', email: 'Bea@X.com', password: 'h' });
    expect(query.mock.calls.at(-1)![1]).toEqual(['Bea', 'bea@x.com', 'h']);
  });
});
