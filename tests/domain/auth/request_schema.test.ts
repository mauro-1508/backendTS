import { describe, expect, it, vi } from 'vitest';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyCodeBodySchema,
} from '../../../src/domains/auth/adapters/inbound/http/dto/auth_request';
import { makeAuthController } from '../../../src/domains/auth/adapters/inbound/http/auth_controller';
import { EmailAlreadyExistsError, InvalidCodeError } from '../../../src/domains/auth/domain/service';
import { makeRegister } from '../../../src/domains/auth/application/register';
import { AuthService } from '../../../src/domains/auth/ports/inbound/auth_service';

const schemas = [registerBodySchema, loginBodySchema, forgotPasswordBodySchema, verifyCodeBodySchema, resetPasswordBodySchema];

describe('esquemas zod de auth', () => {
  it.each(schemas.map((s, i) => [i, s] as const))('esquema %i rechaza undefined y {}', (_i, schema) => {
    expect(schema.safeParse(undefined).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('rechaza password no string', () => {
    expect(registerBodySchema.safeParse({ name: 'a', email: 'a@b.co', password: 123 }).success).toBe(false);
    expect(loginBodySchema.safeParse({ email: 'a@b.co', password: 123 }).success).toBe(false);
    expect(resetPasswordBodySchema.safeParse({ email: 'a@b.co', code: '123456', newPassword: 123 }).success).toBe(false);
  });

  it('acepta entradas validas', () => {
    expect(registerBodySchema.safeParse({ name: 'a', email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginBodySchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(forgotPasswordBodySchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(verifyCodeBodySchema.safeParse({ email: 'a@b.co', code: '123456' }).success).toBe(true);
    expect(resetPasswordBodySchema.safeParse({ email: 'a@b.co', code: '123456', newPassword: 'x' }).success).toBe(true);
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
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'INVALID_BODY', message: expect.any(String) });
    expect(next).not.toHaveBeenCalled();
    expect(service[name]).not.toHaveBeenCalled();
  });

  it('login con password numerico responde 400', async () => {
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await controller.login({ body: { email: 'a@b.co', password: 123 } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('normalizacion y limites del esquema', () => {
  it('email se recorta y pasa a minusculas', () => {
    const r = loginBodySchema.safeParse({ email: '  Ana@X.COM ', password: 'x' });
    expect(r.success && r.data.email).toBe('ana@x.com');
  });
  it('rechaza correo invalido o de mas de 255 caracteres', () => {
    expect(forgotPasswordBodySchema.safeParse({ email: 'no-es-correo' }).success).toBe(false);
    expect(forgotPasswordBodySchema.safeParse({ email: `${'a'.repeat(250)}@x.com` }).success).toBe(false);
  });
  it('name: recorta, no vacio y max 120', () => {
    expect(registerBodySchema.safeParse({ name: '  ', email: 'a@b.co', password: 'x' }).success).toBe(false);
    expect(registerBodySchema.safeParse({ name: 'a'.repeat(121), email: 'a@b.co', password: 'x' }).success).toBe(false);
  });
  it.each(['12345', '1234567', 'abcdef', '12 456'])('code %s no es valido', (code) => {
    expect(verifyCodeBodySchema.safeParse({ email: 'a@b.co', code }).success).toBe(false);
    expect(resetPasswordBodySchema.safeParse({ email: 'a@b.co', code, newPassword: 'x' }).success).toBe(false);
  });
});

describe('auth_controller: errores conocidos', () => {
  const run = async (handler: 'register' | 'verifyCode', error: unknown, body: object) => {
    const service = { register: vi.fn().mockRejectedValue(error), verifyCode: vi.fn().mockRejectedValue(error) };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await makeAuthController(service as unknown as AuthService)[handler]({ body } as any, res, next);
    return { res, next };
  };
  const reg = { name: 'Ana', email: 'ana@x.com', password: 'Abcdef1!x' };

  it('AuthError responde con su httpStatus y code', async () => {
    const { res } = await run('verifyCode', new InvalidCodeError(), { email: 'a@b.co', code: '123456' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'INVALID_CODE', message: expect.any(String) });
  });

  it('password de mas de 72 bytes -> 400 (bytes, no caracteres)', () => {
    const long = 'ñ'.repeat(37); // 74 bytes
    expect(registerBodySchema.safeParse({ name: 'a', email: 'a@b.co', password: long }).success).toBe(false);
    expect(loginBodySchema.safeParse({ email: 'a@b.co', password: long }).success).toBe(false);
    expect(resetPasswordBodySchema.safeParse({ email: 'a@b.co', code: '123456', newPassword: long }).success).toBe(false);
    expect(registerBodySchema.safeParse({ name: 'a', email: 'a@b.co', password: 'ñ'.repeat(36) }).success).toBe(true);
  });

  it('23505 de otra restriccion no se traduce a EMAIL_ALREADY_EXISTS', async () => {
    const err = Object.assign(new Error('dup'), { code: '23505', constraint: 'otra_key' });
    const { res, next } = await run('register', err, reg);
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(err);
  });

  it('EmailAlreadyExistsError -> 409', async () => {
    const { res } = await run('register', new EmailAlreadyExistsError(), reg);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'EMAIL_ALREADY_EXISTS', message: 'Este correo ya tiene una cuenta' });
  });

  it('23505 en register (carrera) -> 409 EMAIL_ALREADY_EXISTS', async () => {
    const { res, next } = await run('register', Object.assign(new Error('dup'), { code: '23505', constraint: 'users_email_key' }), reg);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'EMAIL_ALREADY_EXISTS' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('error desconocido va a next', async () => {
    const boom = new Error('boom');
    const { next } = await run('register', boom, reg);
    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe('register con correo duplicado', () => {
  it('compara normalizado y lanza EmailAlreadyExistsError sin crear', async () => {
    const findByEmail = vi.fn().mockResolvedValue({ userId: 1 });
    const create = vi.fn();
    const register = makeRegister({
      userRepository: { findByEmail, create } as never,
      passwordHasher: { hash: async () => 'h', compare: async () => true },
      roleAssigner: { assignDefaultRole: vi.fn() },
    });
    await expect(register({ name: 'Ana', email: ' ANA@x.com', password: 'Abcdef1!x' })).rejects.toBeInstanceOf(EmailAlreadyExistsError);
    expect(findByEmail).toHaveBeenCalledWith('ana@x.com');
    expect(create).not.toHaveBeenCalled();
  });
});
