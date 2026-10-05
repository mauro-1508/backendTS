import { describe, expect, it, vi } from 'vitest';
import { Response } from 'express';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../src/shared/database/postgres', () => ({ pool: { query } }));

import { makeAuthMiddleware } from '../../../src/shared/http/auth_middleware';
import { makeTranslationRoutes } from '../../../src/domains/translations/adapters/inbound/http/routes';
import { makeGetMyTranslationStats } from '../../../src/domains/translations/application/get_my_translation_stats';
import { postgresMyStatsRepository } from '../../../src/domains/translations/adapters/outbound/postgres/my_stats_repository';
import { TranslationService } from '../../../src/domains/translations/ports/inbound/translation_service';

const tokens = {
  sign: vi.fn(),
  verify: vi.fn((t: string) => {
    if (t !== 'ok') throw new Error('bad');
    return { userId: 7, email: 'a@b.c' };
  }),
};
const authMiddleware = makeAuthMiddleware(tokens as never);

const call = (router: unknown, url: string, headers: Record<string, string>) =>
  new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const out = { status: 200, body: undefined as unknown };
    const res = {
      status: (s: number) => { out.status = s; return res; },
      json: (b: unknown) => { out.body = b; resolve(out); return res; },
    };
    (router as { handle: (...a: unknown[]) => void }).handle(
      { method: 'GET', url, headers, query: {}, body: {} },
      res as unknown as Response,
      (e?: unknown) => reject(e ?? new Error('next')),
    );
  });

describe('GET /translations/me/stats', () => {
  const getMyRepo = vi.fn(async (_: number) => ({ totalTranslations: 3, distinctWords: 2, days: ['2026-10-05'] }));
  const getMyStats = makeGetMyTranslationStats({
    myStatsRepository: { getMyStats: getMyRepo },
    now: () => new Date('2026-10-05T15:00:00Z'),
  });
  const router = makeTranslationRoutes({ translationService: { getMyStats } as unknown as TranslationService, authMiddleware });

  it('401 sin token', async () => {
    expect((await call(router, '/me/stats', {})).status).toBe(401);
    expect(getMyRepo).not.toHaveBeenCalled();
  });
  it('200 con la forma del contrato y usa el user_id del token', async () => {
    const r = await call(router, '/me/stats', { authorization: 'Bearer ok' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: { totalTranslations: 3, distinctWords: 2, activeDays: 1, currentStreakDays: 1, longestStreakDays: 1 },
    });
    expect(getMyRepo).toHaveBeenCalledWith(7);
  });
});

describe('SQL de /me/stats', () => {
  it('filtra por user_id, excluye borradas, normaliza palabras y agrupa en Bogota', async () => {
    query.mockReset();
    query
      .mockResolvedValueOnce({ rows: [{ total: 2, words: 1 }] })
      .mockResolvedValueOnce({ rows: [{ d: '2026-10-05' }] });
    const r = await postgresMyStatsRepository.getMyStats(42);
    expect(r).toEqual({ totalTranslations: 2, distinctWords: 1, days: ['2026-10-05'] });
    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('user_id = $1');
      expect(sql).toContain('is_deleted = FALSE');
      expect(params).toEqual([42]);
    }
    expect(query.mock.calls[0][0]).toContain('lower(btrim(output_text))');
    expect(query.mock.calls[1][0]).toContain('America/Bogota');
  });
});
