import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeRegister } from '../../../src/auth/application/register';
import { makeGoogleLogin } from '../../../src/auth/application/google_login';
import { makeLogin } from '../../../src/auth/application/login';
import { RegistrationFailedError } from '../../../src/auth/domain/service';
import { argsOf, failingEventPublisher, RecordingEventPublisher } from '../../helpers/fakes';

// Emision y envio del codigo de verificacion: aqui solo hay que dejarlos pasar.
const verificationDeps = {
  authRepository: { issueTokenIfAllowed: async () => 'issued' } as never,
  mailer: { sendVerificationCode: async () => undefined, sendPasswordResetCode: async () => undefined },
};
const newUserRepository = (extra: object = {}) =>
  ({
    findByEmail: async () => null,
    create: async (u: { name: string; email: string }) => ({ userId: 42, name: u.name, email: u.email }),
    ...extra,
  }) as never;
const userAccess = { readAccess: async () => ({ roles: ['USER'], permissions: ['translation.create'] }) };

describe('register asigna rol por defecto', () => {
  test('llama a roleAssigner con el id del usuario creado', async () => {
    const assignDefaultRole = mock.fn(async (_id: number) => undefined as void);
    const register = makeRegister({
      userRepository: newUserRepository(),
      passwordHasher: { hash: async () => 'hashed', compare: async () => true },
      roleAssigner: { assignDefaultRole },
      eventPublisher: new RecordingEventPublisher(),
      ...verificationDeps,
    });

    const result = await register({ name: 'Ana Perez', email: 'ana@example.com', password: 'Abcdef1!x' });

    assert.equal(result.success, true);
    assert.deepEqual(argsOf(assignDefaultRole), [42]);
  });

  test('un broker caido no rompe el registro (el evento se publica en silencio)', async () => {
    const log = mock.method(console, 'error', () => {});
    try {
      const register = makeRegister({
        userRepository: newUserRepository(),
        passwordHasher: { hash: async () => 'hashed', compare: async () => true },
        roleAssigner: { assignDefaultRole: async () => undefined },
        eventPublisher: failingEventPublisher,
        ...verificationDeps,
      });
      const result = await register({ name: 'Ana Perez', email: 'ana@example.com', password: 'Abcdef1!x' });
      assert.equal(result.success, true);
    } finally {
      log.mock.restore();
    }
  });
});

describe('registro atomico por compensacion', () => {
  const setup = (assignDefaultRole: () => Promise<void>) => {
    const deleteById = mock.fn(async (_id: number) => undefined as void);
    const eventPublisher = new RecordingEventPublisher();
    const register = makeRegister({
      userRepository: newUserRepository({ deleteById }),
      passwordHasher: { hash: async () => 'hashed', compare: async () => true },
      roleAssigner: { assignDefaultRole },
      eventPublisher,
      ...verificationDeps,
    });
    return { register, deleteById, eventPublisher };
  };

  test('si assignDefaultRole falla borra el usuario y lanza error generico', async () => {
    const { register, deleteById, eventPublisher } = setup(async () => {
      throw new Error('pg: relation "roles" secret detail');
    });
    const error = await register({ name: 'Ana Perez', email: 'ana@example.com', password: 'Abcdef1!x' }).catch((e) => e);
    assert.ok(error instanceof RegistrationFailedError);
    assert.ok(!error.message.includes('pg'));
    assert.deepEqual(argsOf(deleteById), [42]);
    assert.equal(eventPublisher.published.length, 0);
  });
});

describe('google_login asigna rol a cuentas nuevas', () => {
  const build = (assignDefaultRole: (id: number) => Promise<void>, existing: boolean) => {
    const deleteById = mock.fn(async (_id: number) => undefined as void);
    const eventPublisher = new RecordingEventPublisher();
    const googleLogin = makeGoogleLogin({
      userRepository: newUserRepository({
        findByEmail: async () => (existing ? { userId: 5, email: 'a@b.com', status: 'ACTIVE' } : null),
        deleteById,
      }),
      tokenProvider: { sign: () => 'tok', verify: () => ({}) as never },
      roleAssigner: { assignDefaultRole },
      roleReader: userAccess,
      eventPublisher,
    });
    return { googleLogin, deleteById, eventPublisher };
  };

  test('cuenta nueva: asigna rol, devuelve token y publica iam.UserRegistered', async () => {
    const assign = mock.fn(async (_id: number) => undefined as void);
    const { googleLogin, eventPublisher } = build(assign, false);
    const result = await googleLogin({ email: 'a@b.com', name: 'Ana' });
    assert.deepEqual(argsOf(assign), [42]);
    assert.deepEqual(result.data, { token: 'tok' });
    assert.deepEqual(eventPublisher.published, [
      { type: 'iam.UserRegistered', payload: { userId: 42, email: 'a@b.com', name: 'Ana' } },
    ]);
  });

  test('cuenta existente: no asigna rol ni publica evento', async () => {
    const assign = mock.fn(async (_id: number) => undefined as void);
    const { googleLogin, eventPublisher } = build(assign, true);
    await googleLogin({ email: 'a@b.com', name: 'Ana' });
    assert.equal(assign.mock.callCount(), 0);
    assert.equal(eventPublisher.published.length, 0);
  });

  test('si falla la asignacion compensa borrando el usuario', async () => {
    const { googleLogin, deleteById, eventPublisher } = build(async () => {
      throw new Error('boom');
    }, false);
    await assert.rejects(googleLogin({ email: 'a@b.com', name: 'Ana' }), RegistrationFailedError);
    assert.deepEqual(argsOf(deleteById), [42]);
    assert.equal(eventPublisher.published.length, 0);
  });
});

describe('el JWT de sesion lleva roles y permisos', () => {
  const access = { roles: ['LINGUIST'], permissions: ['samples.validate', 'lexicon.read'] };

  test('login firma userId, email, roles y permisos leidos de iam', async () => {
    const sign = mock.fn((_claims: unknown) => 'jwt');
    const login = makeLogin({
      userRepository: {
        findByEmail: async () => ({ userId: 9, name: 'Ana', email: 'ana@x.com', password: 'h', status: 'ACTIVE' }),
      } as never,
      passwordHasher: { hash: async () => 'h', compare: async () => true },
      tokenProvider: { sign, verify: () => ({}) as never },
      roleReader: { readAccess: async (userId: number) => (userId === 9 ? access : { roles: [], permissions: [] }) },
    });
    const result = await login({ email: 'ana@x.com', password: 'clave' });
    assert.deepEqual((result.data as { token: string }).token, 'jwt');
    assert.deepEqual(argsOf(sign), [{ userId: 9, email: 'ana@x.com', roles: access.roles, permissions: access.permissions }]);
  });

  test('google_login (cuenta nueva) tambien firma con roles y permisos', async () => {
    const sign = mock.fn((_claims: unknown) => 'tok');
    const googleLogin = makeGoogleLogin({
      userRepository: newUserRepository(),
      tokenProvider: { sign, verify: () => ({}) as never },
      roleAssigner: { assignDefaultRole: async () => undefined },
      roleReader: { readAccess: async () => access },
      eventPublisher: new RecordingEventPublisher(),
    });
    await googleLogin({ email: 'a@b.com', name: 'Ana' });
    assert.deepEqual(argsOf(sign), [{ userId: 42, email: 'a@b.com', roles: access.roles, permissions: access.permissions }]);
  });
});
