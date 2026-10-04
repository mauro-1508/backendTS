import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeForgotPassword } from '../src/auth/application/forgot_password';
import { makeVerifyCode } from '../src/auth/application/verify_code';
import { makeResetPassword } from '../src/auth/application/reset_password';
import { authDomainService, MAX_RESET_ATTEMPTS } from '../src/auth/domain/service';
import { FakeAuthRepository, FakeUserRepository, RecordingMailer, fakePasswordHasher } from './helpers/fakes';

const EMAIL = 'ada@example.com';

describe('recuperación de contraseña', () => {
  let userRepository: FakeUserRepository;
  let authRepository: FakeAuthRepository;
  let mailer: RecordingMailer;

  beforeEach(async () => {
    userRepository = new FakeUserRepository();
    authRepository = new FakeAuthRepository();
    mailer = new RecordingMailer();
    await userRepository.create({ name: 'Ada', email: EMAIL, password: 'hash:vieja' });
  });

  const forgot = () => makeForgotPassword({ userRepository, authRepository, mailer })({ email: EMAIL });
  const verify = (code: string) => makeVerifyCode({ userRepository, authRepository })({ email: EMAIL, code });
  const reset = (code: string, newPassword = 'nueva-clave-1') =>
    makeResetPassword({ userRepository, authRepository, passwordHasher: fakePasswordHasher })({
      email: EMAIL, code, newPassword,
    });
  const wrongCode = (real: string) => (real === '111111' ? '222222' : '111111');

  test('el código es de 6 dígitos', () => {
    for (let i = 0; i < 50; i++) assert.match(authDomainService.generateResetCode(), /^\d{6}$/);
  });

  test('flujo completo: el código correcto cambia la contraseña y no se reutiliza', async () => {
    await forgot();
    const code = mailer.lastCode();

    await reset(code);

    assert.equal(userRepository.users[0].password, 'hash:nueva-clave-1');
    await assert.rejects(verify(code), /Código inválido/);
  });

  test('un código erróneo cuenta como intento y se rechaza', async () => {
    await forgot();
    await assert.rejects(verify(wrongCode(mailer.lastCode())), /Código inválido/);
    assert.equal(authRepository.tokens[0].attempts, 1);
  });

  test(`tras ${MAX_RESET_ATTEMPTS} intentos fallidos el token queda invalidado, incluso con el código correcto`, async () => {
    await forgot();
    const code = mailer.lastCode();
    for (let i = 0; i < MAX_RESET_ATTEMPTS; i++) {
      await assert.rejects(verify(wrongCode(code)), /Código inválido/);
    }

    await assert.rejects(verify(code), /Demasiados intentos/);
    await assert.rejects(reset(code), /Demasiados intentos/);
  });

  test('emitir un código nuevo invalida los anteriores', async () => {
    await forgot();
    const firstCode = mailer.lastCode();
    await forgot();
    const secondCode = mailer.lastCode();

    if (firstCode !== secondCode) await assert.rejects(verify(firstCode), /Código inválido/);
    assert.equal((await verify(secondCode)).success, true);
    assert.equal(authRepository.tokens.filter(t => !t.usedAt).length, 1);
  });

  test('un código expirado se rechaza', async () => {
    await forgot();
    authRepository.tokens[0].expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(verify(mailer.lastCode()), /expirado/);
  });

  test('correo desconocido: forgot responde igual y no envía nada', async () => {
    const result = await makeForgotPassword({ userRepository, authRepository, mailer })({ email: 'nadie@example.com' });
    assert.equal(result.success, true);
    assert.equal(mailer.sent.length, 0);
  });
});
