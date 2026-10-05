import { describe, expect, it, vi } from 'vitest';
import { Response } from 'express';
import { makeAuthMiddleware } from '../../../src/shared/http/auth_middleware';
import { makeTranslationRoutes } from '../../../src/domains/translations/adapters/inbound/http/routes';
import { makeUserRoutes } from '../../../src/domains/users/adapters/inbound/http/routes';
import { makeGetTranslationStats } from '../../../src/domains/translations/application/get_translation_stats';
import { makeGetUserStats } from '../../../src/domains/users/application/get_user_stats';
import { TranslationService } from '../../../src/domains/translations/ports/inbound/translation_service';
import { UserService } from '../../../src/domains/users/ports/inbound/user_service';

const tokens = {
  sign: vi.fn(),
  verify: vi.fn((t: string) => {
    if (t !== 'ok') throw new Error('bad');
    return { userId: 7, email: 'a@b.c' };
  }),
};
const authMiddleware = makeAuthMiddleware(tokens as never);

// Ejecuta el router y espera a que responda (los handlers son asincronos).
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

const bearer = { authorization: 'Bearer ok' };

const emptyRaw = { totalTranslations: 5, activeUsers30d: 2, daily: [], weekly: [], monthly: [] };
const buildTranslations = (granted: boolean) => {
  const getStats = makeGetTranslationStats({
    statsRepository: { getStats: async () => emptyRaw },
    permissionChecker: { hasPermission: async () => granted },
  });
  return makeTranslationRoutes({ translationService: { getStats } as unknown as TranslationService, authMiddleware });
};
const buildUsers = (granted: boolean) => {
  const getStats = makeGetUserStats({
    statsRepository: { getStats: async () => ({ totalUsers: 10, activeAccounts: 8 }) },
    permissionChecker: { hasPermission: async () => granted },
  });
  return makeUserRoutes({ userService: { getStats } as unknown as UserService, authMiddleware });
};

describe('GET /translations/stats', () => {
  it('401 sin token', async () => {
    expect((await call(buildTranslations(true), '/stats', {})).status).toBe(401);
  });
  it('403 PERMISSION_ERROR sin stats.read', async () => {
    const r = await call(buildTranslations(false), '/stats', bearer);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, code: 'PERMISSION_ERROR', message: 'Permiso insuficiente' });
  });
  it('200 con la forma del contrato', async () => {
    const r = await call(buildTranslations(true), '/stats', bearer);
    expect(r.status).toBe(200);
    const body = r.body as { success: boolean; data: Record<string, unknown[] | number> };
    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual(['activeUsers30d', 'daily', 'monthly', 'totalTranslations', 'weekly']);
    expect([body.data.daily, body.data.weekly, body.data.monthly].map((l) => (l as unknown[]).length)).toEqual([7, 4, 12]);
    expect(body.data.totalTranslations).toBe(5);
  });
});

describe('GET /users/stats', () => {
  it('401 sin token', async () => {
    expect((await call(buildUsers(true), '/stats', {})).status).toBe(401);
  });
  it('403 PERMISSION_ERROR sin stats.read', async () => {
    const r = await call(buildUsers(false), '/stats', bearer);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, code: 'PERMISSION_ERROR', message: 'Permiso insuficiente' });
  });
  it('200 con totalUsers y activeAccounts', async () => {
    const r = await call(buildUsers(true), '/stats', bearer);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { totalUsers: 10, activeAccounts: 8 } });
  });
});
