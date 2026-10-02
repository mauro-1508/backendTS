import { describe, expect, it, vi } from 'vitest';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyCodeBodySchema,
} from '../../../src/domains/auth/adapters/inbound/http/dto/auth_request';
import { makeAuthController } from '../../../src/domains/auth/adapters/inbound/http/auth_controller';
import { AuthService } from '../../../src/domains/auth/ports/inbound/auth_service';

const schemas = [registerBodySchema, loginBodySchema, forgotPasswordBodySchema, verifyCodeBodySchema, resetPasswordBodySchema];

describe('esquemas zod de auth', () => {
  it.each(schemas.map((s, i) => [i, s] as const))('esquema %i rechaza undefined y {}', (_i, schema) => {
    expect(schema.safeParse(undefined).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('rechaza password no string', () => {
    expect(registerBodySchema.safeParse({ name: 'a', email: 'a@b.c', password: 123 }).success).toBe(false);
    expect(loginBodySchema.safeParse({ email: 'a@b.c', password: 123 }).success).toBe(false);
    expect(resetPasswordBodySchema.safeParse({ email: 'a@b.c', code: '1', newPassword: 123 }).success).toBe(false);
  });

  it('acepta entradas validas', () => {
    expect(registerBodySchema.safeParse({ name: 'a', email: 'a@b.c', password: 'x' }).success).toBe(true);
    expect(loginBodySchema.safeParse({ email: 'a@b.c', password: 'x' }).success).toBe(true);
    expect(forgotPasswordBodySchema.safeParse({ email: 'a@b.c' }).success).toBe(true);
    expect(verifyCodeBodySchema.safeParse({ email: 'a@b.c', code: '123456' }).success).toBe(true);
    expect(resetPasswordBodySchema.safeParse({ email: 'a@b.c', code: '1', newPassword: 'x' }).success).toBe(true);
  });
});

describe('auth_controller con body invalido', () => {
  const service = { register: vi.fn(), login: vi.fn(), forgotPassword: vi.fn(), verifyCode: vi.fn(), resetPassword: vi.fn() };
  const controller = makeAuthController(service as unknown as AuthService);
  const handlers = ['register', 'login', 'forgotPassword', 'verifyCode', 'resetPassword'] as const;

  it.each(handlers)('%s responde 400 con body undefined y no llama a next ni al servicio', async (name) => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await controller[name]({ body: undefined } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: expect.any(String) });
    expect(next).not.toHaveBeenCalled();
    expect(service[name]).not.toHaveBeenCalled();
  });

  it('login con password numerico responde 400', async () => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await controller.login({ body: { email: 'a@b.c', password: 123 } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
