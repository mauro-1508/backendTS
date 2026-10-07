import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Response } from 'express';
import { makeAuthMiddleware } from '@traduce/shared';
import { makeUserRoutes } from '../../../src/users/adapters/inbound/http/routes';
import { makeGetUserStats } from '../../../src/users/application/get_user_stats';
import { UserService } from '../../../src/users/ports/inbound/user_service';

const authMiddleware = makeAuthMiddleware({
  sign: () => 'x',
  verify: (t: string) => {
    if (t !== 'ok') throw new Error('bad');
    return { userId: 7, email: 'a@b.c', roles: ['USER'], permissions: [] };
  },
});

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

const buildUsers = (granted: boolean) => {
  const getStats = makeGetUserStats({
    statsRepository: { getStats: async () => ({ totalUsers: 10, activeAccounts: 8 }) },
    permissionChecker: { hasPermission: async () => granted },
  });
  return makeUserRoutes({ userService: { getStats } as unknown as UserService, authMiddleware });
};

describe('GET /users/stats', () => {
  test('401 sin token', async () => {
    assert.equal((await call(buildUsers(true), '/stats', {})).status, 401);
  });

  test('403 PERMISSION_ERROR sin stats.read', async () => {
    const r = await call(buildUsers(false), '/stats', bearer);
    assert.equal(r.status, 403);
    assert.deepEqual(r.body, { success: false, code: 'PERMISSION_ERROR', message: 'Permiso insuficiente' });
  });

  test('200 con totalUsers y activeAccounts', async () => {
    const r = await call(buildUsers(true), '/stats', bearer);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, data: { totalUsers: 10, activeAccounts: 8 } });
  });
});
