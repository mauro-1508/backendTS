import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Response } from 'express';
import { makeAuthMiddleware, PERMISSIONS } from '@traduce/shared';
import { makeUserRoutes } from '../../../src/users/adapters/inbound/http/routes';
import { makeListAdminIds } from '../../../src/users/application/list_admin_ids';
import { UserService } from '../../../src/users/ports/inbound/user_service';

// 'service' trae admins.read (token de profile); 'admin' es un usuario ADMIN normal.
const authMiddleware = makeAuthMiddleware({
  sign: () => 'x',
  verify: (t: string) => {
    if (t === 'service') return { userId: 0, email: 'p@internal', roles: [], permissions: [PERMISSIONS.ADMIN_DIRECTORY_READ] };
    if (t === 'admin') return { userId: 1, email: 'a@b.c', roles: ['ADMIN'], permissions: [PERMISSIONS.USERS_MANAGE] };
    throw new Error('bad');
  },
});

const call = (router: unknown, headers: Record<string, string>) =>
  new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const out = { status: 200, body: undefined as unknown };
    const res = {
      status: (s: number) => { out.status = s; return res; },
      json: (b: unknown) => { out.body = b; resolve(out); return res; },
    };
    (router as { handle: (...a: unknown[]) => void }).handle(
      { method: 'GET', url: '/admins', headers, query: {}, body: {} },
      res as unknown as Response,
      (e?: unknown) => reject(e ?? new Error('next')),
    );
  });

const router = () => {
  const listAdminIds = makeListAdminIds({ adminDirectory: { listActiveAdminIds: async () => [1, 2] } });
  return makeUserRoutes({ userService: { listAdminIds } as unknown as UserService, authMiddleware });
};

describe('GET /users/admins', () => {
  test('401 sin token', async () => {
    assert.equal((await call(router(), {})).status, 401);
  });

  test('403 para un usuario aunque sea ADMIN (solo tokens de servicio)', async () => {
    assert.equal((await call(router(), { authorization: 'Bearer admin' })).status, 403);
  });

  test('200 con los ids de los admins para el token de servicio', async () => {
    const r = await call(router(), { authorization: 'Bearer service' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, data: { userIds: [1, 2] } });
  });
});
