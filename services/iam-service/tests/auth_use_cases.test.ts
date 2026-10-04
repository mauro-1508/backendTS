import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeJwtTokenProvider } from '@traduce/shared';
import { makeRegister } from '../src/auth/application/register';
import { makeLogin } from '../src/auth/application/login';
import { makeGoogleLogin } from '../src/auth/application/google_login';
import { makeIssueToken } from '../src/auth/application/issue_token';
import {
  FakeRoleRepository, FakeUserRepository, RecordingEventPublisher, failingEventPublisher, fakePasswordHasher,
} from './helpers/fakes';

const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-iam', expiresIn: '1h' });
const ADA = { name: 'Ada', email: 'ada@example.com', password: 'clave-segura' };
const tokenOf = (result: { data?: unknown }) => (result.data as { token: string }).token;

describe('casos de uso de auth', () => {
  let userRepository: FakeUserRepository;
  let roleRepository: FakeRoleRepository;
  let eventPublisher: RecordingEventPublisher;
  let issueToken: ReturnType<typeof makeIssueToken>;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    roleRepository = new FakeRoleRepository();
    eventPublisher = new RecordingEventPublisher();
    issueToken = makeIssueToken({ tokenProvider, roleRepository });
  });

  const register = () => makeRegister({ userRepository, passwordHasher: fakePasswordHasher, eventPublisher });
  const login = () => makeLogin({ userRepository, passwordHasher: fakePasswordHasher, issueToken });

  describe('register', () => {
    test('crea el usuario con la contraseña hasheada y publica iam.UserRegistered', async () => {
      const result = await register()(ADA);

      assert.equal(result.success, true);
      assert.equal(userRepository.users[0].password, 'hash:clave-segura');
      assert.deepEqual(eventPublisher.published, [
        { type: 'iam.UserRegistered', payload: { userId: 1, email: ADA.email, name: ADA.name } },
      ]);
    });

    test('rechaza un correo ya registrado y no publica evento', async () => {
      await register()(ADA);
      eventPublisher.published = [];

      await assert.rejects(register()(ADA), /Ya existe un usuario con ese correo/);
      assert.equal(eventPublisher.published.length, 0);
    });

    test('exige nombre, email y contraseña', async () => {
      await assert.rejects(register()({ ...ADA, password: '' }), /obligatorios/);
    });

    test('si el broker falla, el registro igualmente termina bien', async () => {
      const result = await makeRegister({
        userRepository, passwordHasher: fakePasswordHasher, eventPublisher: failingEventPublisher,
      })(ADA);

      assert.equal(result.success, true);
      assert.equal(userRepository.users.length, 1);
    });
  });

  describe('login', () => {
    const loginAda = () => login()({ email: ADA.email, password: ADA.password });

    test('el token lleva los roles del usuario leídos de la base', async () => {
      await register()(ADA);
      roleRepository.rolesByUser.set(1, ['ADMIN', 'TEACHER']);

      const user = tokenProvider.verify(tokenOf(await loginAda()));

      assert.deepEqual(user, { userId: 1, email: ADA.email, roles: ['ADMIN', 'TEACHER'] });
    });

    test('un usuario sin roles recibe un token con roles vacíos', async () => {
      await register()(ADA);

      assert.deepEqual(tokenProvider.verify(tokenOf(await loginAda())).roles, []);
    });

    test('responde con los datos públicos del usuario, sin contraseña', async () => {
      await register()(ADA);

      const { data } = await loginAda();

      assert.deepEqual((data as { user: unknown }).user, { user_id: 1, name: ADA.name, email: ADA.email });
    });

    test('contraseña incorrecta o usuario inexistente: credenciales inválidas', async () => {
      await register()(ADA);

      await assert.rejects(login()({ email: ADA.email, password: 'otra' }), /Credenciales inválidas/);
      await assert.rejects(login()({ email: 'nadie@example.com', password: 'x' }), /Credenciales inválidas/);
    });

    test('exige email y contraseña', async () => {
      await assert.rejects(login()({ email: '', password: '' }), /obligatorios/);
    });
  });

  describe('googleLogin', () => {
    const googleLogin = () => makeGoogleLogin({ userRepository, issueToken, eventPublisher });

    test('cuenta nueva: la crea, publica iam.UserRegistered y firma el token', async () => {
      const result = await googleLogin()({ email: 'g@example.com', name: 'Gina' });

      assert.equal(tokenProvider.verify(tokenOf(result)).email, 'g@example.com');
      assert.equal(eventPublisher.published[0].type, 'iam.UserRegistered');
    });

    test('cuenta existente: no publica evento y el token lleva sus roles', async () => {
      const existing = await userRepository.create({ name: 'Gina', email: 'g@example.com', password: null });
      roleRepository.rolesByUser.set(existing.userId, ['ADMIN']);

      const result = await googleLogin()({ email: 'g@example.com', name: 'Gina' });

      assert.deepEqual(tokenProvider.verify(tokenOf(result)).roles, ['ADMIN']);
      assert.equal(eventPublisher.published.length, 0);
    });
  });
});
