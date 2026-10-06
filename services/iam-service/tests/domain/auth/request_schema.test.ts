import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyCodeBodySchema,
} from '../../../src/auth/adapters/inbound/http/dto/auth_request';
import { makeAuthController } from '../../../src/auth/adapters/inbound/http/auth_controller';
import { EmailAlreadyExistsError, InvalidCodeError } from '../../../src/auth/domain/service';
import { makeRegister } from '../../../src/auth/application/register';
import { AuthService } from '../../../src/auth/ports/inbound/auth_service';
import { argsOf, assertMatch, fakeRes, RecordingEventPublisher } from '../../helpers/fakes';

const schemas = [registerBodySchema, loginBodySchema, forgotPasswordBodySchema, verifyCodeBodySchema, resetPasswordBodySchema];

describe('esquemas zod de auth', () => {
  schemas.forEach((schema, i) => {
    test(`esquema ${i} rechaza undefined y {}`, () => {
      assert.equal(schema.safeParse(undefined).success, false);
      assert.equal(schema.safeParse({}).success, false);
    });
  });

  test('rechaza password no string', () => {
    assert.equal(registerBodySchema.safeParse({ name: 'a', email: 'a@b.co', password: 123 }).success, false);
    assert.equal(loginBodySchema.safeParse({ email: 'a@b.co', password: 123 }).success, false);
    assert.equal(resetPasswordBodySchema.safeParse({ email: 'a@b.co', code: '123456', newPassword: 123 }).success, false);
  });

  test('acepta entradas validas', () => {
    assert.equal(registerBodySchema.safeParse({ name: 'a', email: 'a@b.co', password: 'x' }).success, true);
    assert.equal(loginBodySchema.safeParse({ email: 'a@b.co', password: 'x' }).success, true);
    assert.equal(forgotPasswordBodySchema.safeParse({ email: 'a@b.co' }).success, true);
    assert.equal(verifyCodeBodySchema.safeParse({ email: 'a@b.co', code: '123456' }).success, true);
    assert.equal(resetPasswordBodySchema.safeParse({ email: 'a@b.co', code: '123456', newPassword: 'x' }).success, true);
  });
});

describe('auth_controller con body invalido', () => {
  const handlers = ['register', 'login', 'forgotPassword', 'verifyCode', 'resetPassword'] as const;
  const service = Object.fromEntries(handlers.map((h) => [h, mock.fn()])) as unknown as Record<(typeof handlers)[number], ReturnType<typeof mock.fn>>;
  const controller = makeAuthController(service as unknown as AuthService);

  for (const name of handlers) {
    test(`${name} responde 400 con body undefined y no llama a next ni al servicio`, async () => {
      const res = fakeRes();
      const next = mock.fn();
      await controller[name]({ body: undefined } as any, res, next);
      assert.deepEqual(argsOf(res.status), [400]);
      assertMatch(argsOf(res.json)[0], { success: false, code: 'INVALID_BODY', message: /.+/ });
      assert.equal(next.mock.callCount(), 0);
      assert.equal(service[name].mock.callCount(), 0);
    });
  }

  test('login con password numerico responde 400', async () => {
    const res = fakeRes();
    const next = mock.fn();
    await controller.login({ body: { email: 'a@b.co', password: 123 } } as any, res, next);
    assert.deepEqual(argsOf(res.status), [400]);
    assert.equal(next.mock.callCount(), 0);
  });
});

describe('normalizacion y limites del esquema', () => {
  test('email se recorta y pasa a minusculas', () => {
    const r = loginBodySchema.safeParse({ email: '  Ana@X.COM ', password: 'x' });
    assert.equal(r.success && r.data.email, 'ana@x.com');
  });
  test('rechaza correo invalido o de mas de 255 caracteres', () => {
    assert.equal(forgotPasswordBodySchema.safeParse({ email: 'no-es-correo' }).success, false);
    assert.equal(forgotPasswordBodySchema.safeParse({ email: `${'a'.repeat(250)}@x.com` }).success, false);
  });
  test('name: recorta, no vacio y max 120', () => {
    assert.equal(registerBodySchema.safeParse({ name: '  ', email: 'a@b.co', password: 'x' }).success, false);
    assert.equal(registerBodySchema.safeParse({ name: 'a'.repeat(121), email: 'a@b.co', password: 'x' }).success, false);
  });
  for (const code of ['12345', '1234567', 'abcdef', '12 456']) {
    test(`code ${code} no es valido`, () => {
      assert.equal(verifyCodeBodySchema.safeParse({ email: 'a@b.co', code }).success, false);
      assert.equal(resetPasswordBodySchema.safeParse({ email: 'a@b.co', code, newPassword: 'x' }).success, false);
    });
  }
});

describe('auth_controller: errores conocidos', () => {
  const run = async (handler: 'register' | 'verifyCode', error: unknown, body: object) => {
    const rejecting = mock.fn(async () => { throw error; });
    const service = { register: rejecting, verifyCode: rejecting };
    const res = fakeRes();
    const next = mock.fn();
    await makeAuthController(service as unknown as AuthService)[handler]({ body } as any, res, next);
    return { res, next };
  };
  const reg = { name: 'Ana', email: 'ana@x.com', password: 'Abcdef1!x' };

  test('AuthError responde con su httpStatus y code', async () => {
    const { res } = await run('verifyCode', new InvalidCodeError(), { email: 'a@b.co', code: '123456' });
    assert.deepEqual(argsOf(res.status), [400]);
    assertMatch(argsOf(res.json)[0], { success: false, code: 'INVALID_CODE', message: /.+/ });
  });

  test('password de mas de 72 bytes -> 400 (bytes, no caracteres)', () => {
    const long = 'ñ'.repeat(37); // 74 bytes
    assert.equal(registerBodySchema.safeParse({ name: 'a', email: 'a@b.co', password: long }).success, false);
    assert.equal(loginBodySchema.safeParse({ email: 'a@b.co', password: long }).success, false);
    assert.equal(resetPasswordBodySchema.safeParse({ email: 'a@b.co', code: '123456', newPassword: long }).success, false);
    assert.equal(registerBodySchema.safeParse({ name: 'a', email: 'a@b.co', password: 'ñ'.repeat(36) }).success, true);
  });

  test('23505 de otra restriccion no se traduce a EMAIL_ALREADY_EXISTS', async () => {
    const err = Object.assign(new Error('dup'), { code: '23505', constraint: 'otra_key' });
    const { res, next } = await run('register', err, reg);
    assert.equal(res.status.mock.callCount(), 0);
    assert.deepEqual(argsOf(next), [err]);
  });

  test('EmailAlreadyExistsError -> 409', async () => {
    const { res } = await run('register', new EmailAlreadyExistsError(), reg);
    assert.deepEqual(argsOf(res.status), [409]);
    assert.deepEqual(argsOf(res.json)[0], { success: false, code: 'EMAIL_ALREADY_EXISTS', message: 'Este correo ya tiene una cuenta' });
  });

  test('23505 en register (carrera) -> 409 EMAIL_ALREADY_EXISTS', async () => {
    const { res, next } = await run('register', Object.assign(new Error('dup'), { code: '23505', constraint: 'users_email_key' }), reg);
    assert.deepEqual(argsOf(res.status), [409]);
    assertMatch(argsOf(res.json)[0], { code: 'EMAIL_ALREADY_EXISTS' });
    assert.equal(next.mock.callCount(), 0);
  });

  test('error desconocido va a next', async () => {
    const boom = new Error('boom');
    const { next } = await run('register', boom, reg);
    assert.deepEqual(argsOf(next), [boom]);
  });
});

describe('register con correo duplicado', () => {
  test('compara normalizado y lanza EmailAlreadyExistsError sin crear', async () => {
    const findByEmail = mock.fn(async (_email: string) => ({ userId: 1 }));
    const create = mock.fn(async () => ({}));
    const register = makeRegister({
      userRepository: { findByEmail, create } as never,
      passwordHasher: { hash: async () => 'h', compare: async () => true },
      roleAssigner: { assignDefaultRole: async () => undefined },
      authRepository: {} as never,
      mailer: { sendVerificationCode: async () => undefined, sendPasswordResetCode: async () => undefined },
      eventPublisher: new RecordingEventPublisher(),
    });
    await assert.rejects(register({ name: 'Ana', email: ' ANA@x.com', password: 'Abcdef1!x' }), EmailAlreadyExistsError);
    assert.deepEqual(argsOf(findByEmail), ['ana@x.com']);
    assert.equal(create.mock.callCount(), 0);
  });
});
