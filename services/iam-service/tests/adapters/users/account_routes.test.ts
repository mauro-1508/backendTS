import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Response } from 'express';
import { makeAuthMiddleware } from '@traduce/shared';
import { makeUserRoutes } from '../../../src/users/adapters/inbound/http/routes';
import { makeChangePassword } from '../../../src/users/application/change_password';
import { makeDeleteAccount } from '../../../src/users/application/delete_account';
import { UserService } from '../../../src/users/ports/inbound/user_service';
import { User } from '../../../src/users/domain/entity';
import { bcryptPasswordHasher } from '../../../src/users/adapters/outbound/security/password';
import { argsOf, assertMatch } from '../../helpers/fakes';

const tokens = {
  sign: () => 'x',
  verify: (t: string) => {
    if (t !== 'ok') throw new Error('bad');
    return { userId: 7, email: 'a@b.c', roles: ['USER'], permissions: [] };
  },
};
const authMiddleware = makeAuthMiddleware(tokens);
const bearer = { authorization: 'Bearer ok' };

const call = (router: unknown, method: string, url: string, headers: Record<string, string>, body?: unknown) =>
  new Promise<{ status: number; body: any }>((resolve, reject) => {
    const out = { status: 200, body: undefined as unknown };
    const res = {
      status: (s: number) => { out.status = s; return res; },
      json: (b: unknown) => { out.body = b; resolve(out as never); return res; },
    };
    (router as { handle: (...a: unknown[]) => void }).handle(
      { method, url, headers, query: {}, body },
      res as unknown as Response,
      (e?: unknown) => reject(e ?? new Error('next')),
    );
  });

const OLD = 'Clave.Vieja1';
const NEW = 'Clave.Nueva2';

const build = async (opts: { lastAdmin?: boolean; eraseFails?: boolean } = {}) => {
  const user: User = {
    userId: 7, name: 'Ana', email: 'a@b.c', password: await bcryptPasswordHasher.hash(OLD), status: 'ACTIVE',
    emailVerifiedAt: null, termsAccepted: true, termsAcceptedAt: null, createdAt: new Date(),
  };
  const deps = {
    userRepository: {
      findById: async () => user,
      findByEmail: async () => null,
      create: async () => user,
      deleteById: async () => undefined,
      updatePassword: async () => undefined,
    },
    accountRepository: {
      changePassword: mock.fn(async (_id: number, _hash: string) => undefined as void),
      erase: mock.fn(async (_id: number) => {
        if (opts.eraseFails) throw new Error('boom');
        return 'erased' as const;
      }),
    },
    passwordHasher: bcryptPasswordHasher,
  };
  const userService = {
    changePassword: makeChangePassword(deps),
    deleteAccount: makeDeleteAccount({ ...deps, adminGuard: { isLastAdmin: async () => !!opts.lastAdmin } }),
  } as unknown as UserService;
  return { router: makeUserRoutes({ userService, authMiddleware }), deps };
};

describe('POST /users/me/password', () => {
  test('401 sin token', async () => {
    const { router } = await build();
    assert.equal((await call(router, 'POST', '/me/password', {}, { currentPassword: OLD, newPassword: NEW })).status, 401);
  });

  test('400 VALIDATION_ERROR con body incompleto', async () => {
    const { router } = await build();
    const r = await call(router, 'POST', '/me/password', bearer, { currentPassword: OLD });
    assert.equal(r.status, 400);
    assertMatch(r.body, { success: false, code: 'VALIDATION_ERROR' });
  });

  test('400 VALIDATION_ERROR con contraseña nueva débil', async () => {
    const { router, deps } = await build();
    const r = await call(router, 'POST', '/me/password', bearer, { currentPassword: OLD, newPassword: 'sinsimbolo1A' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'VALIDATION_ERROR');
    assert.equal(deps.accountRepository.changePassword.mock.callCount(), 0);
  });

  test('403 INVALID_PASSWORD si la actual no coincide', async () => {
    const { router } = await build();
    const r = await call(router, 'POST', '/me/password', bearer, { currentPassword: 'mal', newPassword: NEW });
    assert.equal(r.status, 403);
    assertMatch(r.body, { success: false, code: 'INVALID_PASSWORD' });
  });

  test('200 success true', async () => {
    const { router, deps } = await build();
    const r = await call(router, 'POST', '/me/password', bearer, { currentPassword: OLD, newPassword: NEW });
    assert.equal(r.status, 200);
    assertMatch(r.body, { success: true, message: /.+/ });
    assert.equal(deps.accountRepository.changePassword.mock.callCount(), 1);
  });
});

describe('DELETE /users/me', () => {
  test('401 sin token', async () => {
    const { router } = await build();
    assert.equal((await call(router, 'DELETE', '/me', {}, { password: OLD })).status, 401);
  });

  test('400 VALIDATION_ERROR sin password', async () => {
    const { router } = await build();
    const r = await call(router, 'DELETE', '/me', bearer, {});
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'VALIDATION_ERROR');
  });

  test('400 VALIDATION_ERROR si el body no llega (undefined)', async () => {
    const { router } = await build();
    assert.equal((await call(router, 'DELETE', '/me', bearer, undefined)).status, 400);
  });

  test('403 INVALID_PASSWORD', async () => {
    const { router, deps } = await build();
    const r = await call(router, 'DELETE', '/me', bearer, { password: 'mal' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'INVALID_PASSWORD');
    assert.equal(deps.accountRepository.erase.mock.callCount(), 0);
  });

  test('409 LAST_ADMIN', async () => {
    const { router, deps } = await build({ lastAdmin: true });
    const r = await call(router, 'DELETE', '/me', bearer, { password: OLD });
    assert.equal(r.status, 409);
    assertMatch(r.body, { success: false, code: 'LAST_ADMIN' });
    assert.equal(deps.accountRepository.erase.mock.callCount(), 0);
  });

  test('200 success true y llama a erase', async () => {
    const { router, deps } = await build();
    const r = await call(router, 'DELETE', '/me', bearer, { password: OLD });
    assert.equal(r.status, 200);
    assertMatch(r.body, { success: true });
    assert.deepEqual(argsOf(deps.accountRepository.erase), [7]);
  });

  test('un fallo interno al borrar llega al errorHandler (next), no a un 200', async () => {
    const { router } = await build({ eraseFails: true });
    await assert.rejects(call(router, 'DELETE', '/me', bearer, { password: OLD }), /boom/);
  });
});
