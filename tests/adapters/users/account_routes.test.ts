import { describe, expect, it, vi } from 'vitest';
import { Response } from 'express';
import { makeAuthMiddleware } from '../../../src/shared/http/auth_middleware';
import { makeUserRoutes } from '../../../src/domains/users/adapters/inbound/http/routes';
import { makeChangePassword } from '../../../src/domains/users/application/change_password';
import { makeDeleteAccount } from '../../../src/domains/users/application/delete_account';
import { UserService } from '../../../src/domains/users/ports/inbound/user_service';
import { User } from '../../../src/domains/users/domain/entity';
import { bcryptPasswordHasher } from '../../../src/domains/users/adapters/outbound/security/password';

const tokens = {
  sign: vi.fn(),
  verify: vi.fn((t: string) => {
    if (t !== 'ok') throw new Error('bad');
    return { userId: 7, email: 'a@b.c' };
  }),
};
const authMiddleware = makeAuthMiddleware(tokens as never);
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
    userRepository: { findById: async () => user, findByEmail: vi.fn(), create: vi.fn(), deleteById: vi.fn(), updatePassword: vi.fn() },
    accountRepository: {
      changePassword: vi.fn(async () => undefined),
      erase: vi.fn(async () => {
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
  it('401 sin token', async () => {
    const { router } = await build();
    expect((await call(router, 'POST', '/me/password', {}, { currentPassword: OLD, newPassword: NEW })).status).toBe(401);
  });
  it('400 VALIDATION_ERROR con body incompleto', async () => {
    const { router } = await build();
    const r = await call(router, 'POST', '/me/password', bearer, { currentPassword: OLD });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });
  it('400 VALIDATION_ERROR con contraseña nueva débil', async () => {
    const { router, deps } = await build();
    const r = await call(router, 'POST', '/me/password', bearer, { currentPassword: OLD, newPassword: 'sinsimbolo1A' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(deps.accountRepository.changePassword).not.toHaveBeenCalled();
  });
  it('403 INVALID_PASSWORD si la actual no coincide', async () => {
    const { router } = await build();
    const r = await call(router, 'POST', '/me/password', bearer, { currentPassword: 'mal', newPassword: NEW });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ success: false, code: 'INVALID_PASSWORD' });
  });
  it('200 success true', async () => {
    const { router, deps } = await build();
    const r = await call(router, 'POST', '/me/password', bearer, { currentPassword: OLD, newPassword: NEW });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, message: expect.any(String) });
    expect(deps.accountRepository.changePassword).toHaveBeenCalledOnce();
  });
});

describe('DELETE /users/me', () => {
  it('401 sin token', async () => {
    const { router } = await build();
    expect((await call(router, 'DELETE', '/me', {}, { password: OLD })).status).toBe(401);
  });
  it('400 VALIDATION_ERROR sin password', async () => {
    const { router } = await build();
    const r = await call(router, 'DELETE', '/me', bearer, {});
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
  });
  it('400 VALIDATION_ERROR si el body no llega (undefined)', async () => {
    const { router } = await build();
    expect((await call(router, 'DELETE', '/me', bearer, undefined)).status).toBe(400);
  });
  it('403 INVALID_PASSWORD', async () => {
    const { router, deps } = await build();
    const r = await call(router, 'DELETE', '/me', bearer, { password: 'mal' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('INVALID_PASSWORD');
    expect(deps.accountRepository.erase).not.toHaveBeenCalled();
  });
  it('409 LAST_ADMIN', async () => {
    const { router, deps } = await build({ lastAdmin: true });
    const r = await call(router, 'DELETE', '/me', bearer, { password: OLD });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ success: false, code: 'LAST_ADMIN' });
    expect(deps.accountRepository.erase).not.toHaveBeenCalled();
  });
  it('200 success true y llama a erase', async () => {
    const { router, deps } = await build();
    const r = await call(router, 'DELETE', '/me', bearer, { password: OLD });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true });
    expect(deps.accountRepository.erase).toHaveBeenCalledWith(7);
  });
  it('un fallo interno al borrar llega al errorHandler (next), no a un 200', async () => {
    const { router } = await build({ eraseFails: true });
    await expect(call(router, 'DELETE', '/me', bearer, { password: OLD })).rejects.toThrow('boom');
  });
});
