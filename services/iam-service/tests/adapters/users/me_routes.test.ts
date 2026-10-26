import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Response } from 'express';
import { makeAuthMiddleware } from '@traduce/shared';
import { makeUserRoutes } from '../../../src/users/adapters/inbound/http/routes';
import { UserService } from '../../../src/users/ports/inbound/user_service';

const authMiddleware = makeAuthMiddleware({
  sign: () => 'x',
  verify: () => ({ userId: 7, email: 'ana@x.com', roles: ['USER'], permissions: [] }),
});

/** GET /me contra el router; `next(error)` rechaza la promesa, como haria el errorHandler. */
const getMe = (getById: UserService['getById']) =>
  new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const out = { status: 200, body: undefined as unknown };
    const res = {
      status: (s: number) => { out.status = s; return res; },
      json: (b: unknown) => { out.body = b; resolve(out); return res; },
    };
    const router = makeUserRoutes({ userService: { getById } as unknown as UserService, authMiddleware });
    (router as unknown as { handle: (...a: unknown[]) => void }).handle(
      { method: 'GET', url: '/me', headers: { authorization: 'Bearer t' }, query: {}, body: {} },
      res as unknown as Response,
      (e?: unknown) => reject(e ?? new Error('next')),
    );
  });

describe('GET /users/me', () => {
  test('200 con los datos basicos y has_password, sin el hash', async () => {
    const { status, body } = await getMe(async () => ({ userId: 7, name: 'Ana', email: 'ana@x.com', password: '$2b$hash' }) as never);
    assert.equal(status, 200);
    assert.deepEqual(body, { success: true, data: { user_id: 7, name: 'Ana', email: 'ana@x.com', has_password: true } });
  });

  test('404 USER_NOT_FOUND si la cuenta ya no existe', async () => {
    const { status, body } = await getMe(async () => null);
    assert.equal(status, 404);
    assert.equal((body as { code: string }).code, 'USER_NOT_FOUND');
  });

  test('un fallo interno va al errorHandler (500 generico) y su mensaje no llega al cliente', async () => {
    const internal = new Error('connect ECONNREFUSED postgres-iam:5432');
    await assert.rejects(getMe(async () => { throw internal; }), error => error === internal);
  });
});
