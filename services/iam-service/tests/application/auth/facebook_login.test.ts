import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeFacebookLogin } from '../../../src/auth/application/facebook_login';
import { InvalidFacebookTokenError } from '../../../src/auth/domain/service';
import { User } from '../../../src/users/domain/entity';
import { argsOf, facebookAccessToken, fakeFacebookTokenVerifier, rejectsWith, RecordingEventPublisher, SOCIAL_CONSENT } from '../../helpers/fakes';

const existing = (status: User['status']) => ({ userId: 7, name: 'Ana', email: 'ana@x.com', status }) as User;

const setup = (verifier = fakeFacebookTokenVerifier, found: User | null = null) => {
  const create = mock.fn(async (u: { name: string; email: string; status?: string }) => ({ userId: 42, name: u.name, email: u.email }));
  const findByEmail = mock.fn(async (_email: string) => found);
  const facebookLogin = makeFacebookLogin({
    userRepository: { findByEmail, create, deleteById: async () => undefined } as never,
    facebookTokenVerifier: verifier,
    tokenProvider: { sign: () => 'jwt', verify: () => ({}) as never },
    roleAssigner: { assignDefaultRole: async () => undefined },
    roleReader: { readAccess: async () => ({ roles: ['USER'], permissions: [] }) },
    eventPublisher: new RecordingEventPublisher(),
  });
  return { facebookLogin, create, findByEmail };
};

describe('facebook_login', () => {
  test('sin correo en Facebook: FACEBOOK_EMAIL_REQUIRED y no consulta la BD', async () => {
    const { facebookLogin, findByEmail } = setup();
    await rejectsWith(facebookLogin({ accessToken: facebookAccessToken({ email: null }) }),
      { code: 'FACEBOOK_EMAIL_REQUIRED', httpStatus: 400 });
    assert.equal(findByEmail.mock.callCount(), 0);
  });

  test('token rechazado por el verificador: el error se propaga y no crea cuenta', async () => {
    const { facebookLogin, create } = setup({ verify: async () => { throw new InvalidFacebookTokenError(); } });
    await rejectsWith(facebookLogin({ accessToken: 'falso' }), { code: 'INVALID_FACEBOOK_TOKEN', httpStatus: 401 });
    assert.equal(create.mock.callCount(), 0);
  });

  test('correo nuevo: crea la cuenta ACTIVE con el correo normalizado y responde como /auth/login', async () => {
    const { facebookLogin, create } = setup();
    const result = await facebookLogin({ ...SOCIAL_CONSENT, accessToken: facebookAccessToken({ email: ' Ana@X.com ', name: 'Ana' }) });
    assert.equal(argsOf(create)[0].email, 'ana@x.com');
    assert.equal(argsOf(create)[0].status, 'ACTIVE');
    assert.deepEqual(result.data, { token: 'jwt', user: { user_id: 42, name: 'Ana', email: 'ana@x.com' } });
  });

  test('cuenta existente ACTIVE: inicia sesion sin crear otra', async () => {
    const { facebookLogin, create } = setup(fakeFacebookTokenVerifier, existing('ACTIVE'));
    const result = await facebookLogin({ ...SOCIAL_CONSENT, accessToken: facebookAccessToken({ email: 'ana@x.com' }) });
    assert.equal(create.mock.callCount(), 0);
    assert.deepEqual(result.data, { token: 'jwt', user: { user_id: 7, name: 'Ana', email: 'ana@x.com' } });
  });

  test('cuenta BLOCKED: ACCOUNT_BLOCKED; cuenta sin verificar: EMAIL_NOT_VERIFIED', async () => {
    const accessToken = facebookAccessToken({ email: 'ana@x.com' });
    await rejectsWith(setup(fakeFacebookTokenVerifier, existing('BLOCKED')).facebookLogin({ accessToken }), { code: 'ACCOUNT_BLOCKED' });
    await rejectsWith(setup(fakeFacebookTokenVerifier, existing('INACTIVE')).facebookLogin({ accessToken }), { code: 'EMAIL_NOT_VERIFIED' });
  });
});

describe('facebook_login y el consentimiento (Ley 1581)', () => {
  test('cuenta nueva sin consentimiento: TERMS_REQUIRED y no crea la cuenta', async () => {
    const { facebookLogin, create } = setup();
    await rejectsWith(facebookLogin({ accessToken: facebookAccessToken({ email: 'nueva@x.com' }) }), { code: 'TERMS_REQUIRED', httpStatus: 400 });
    assert.equal(create.mock.callCount(), 0);
  });

  test('cuenta existente ACTIVE entra sin enviar consentimiento', async () => {
    const result = await setup(fakeFacebookTokenVerifier, existing('ACTIVE'))
      .facebookLogin({ accessToken: facebookAccessToken({ email: 'ana@x.com' }) });
    assert.deepEqual(result.data, { token: 'jwt', user: { user_id: 7, name: 'Ana', email: 'ana@x.com' } });
  });
});
