import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeGoogleLogin } from '../../../src/auth/application/google_login';
import { InvalidGoogleTokenError } from '../../../src/auth/domain/service';
import { argsOf, fakeGoogleTokenVerifier, googleIdToken, rejectsWith, RecordingEventPublisher, SOCIAL_CONSENT } from '../../helpers/fakes';

const setup = (verifier = fakeGoogleTokenVerifier) => {
  const create = mock.fn(async (u: { name: string; email: string }) => ({ userId: 42, name: u.name, email: u.email }));
  const findByEmail = mock.fn(async (_email: string) => null);
  const googleLogin = makeGoogleLogin({
    userRepository: { findByEmail, create, deleteById: async () => undefined } as never,
    googleTokenVerifier: verifier,
    tokenProvider: { sign: () => 'jwt', verify: () => ({}) as never },
    roleAssigner: { assignDefaultRole: async () => undefined },
    roleReader: { readAccess: async () => ({ roles: ['USER'], permissions: [] }) },
    eventPublisher: new RecordingEventPublisher(),
  });
  return { googleLogin, create, findByEmail };
};

describe('google_login verifica el ID token', () => {
  test('correo no verificado por Google: INVALID_GOOGLE_TOKEN y no crea cuenta', async () => {
    const { googleLogin, create } = setup();
    await rejectsWith(googleLogin({ idToken: googleIdToken({ email: 'ana@x.com', name: 'Ana', emailVerified: false }) }),
      { code: 'INVALID_GOOGLE_TOKEN', httpStatus: 401 });
    assert.equal(create.mock.callCount(), 0);
  });

  test('token rechazado por el verificador: el error se propaga y no se consulta la BD', async () => {
    const { googleLogin, findByEmail } = setup({ verify: async () => { throw new InvalidGoogleTokenError(); } });
    await rejectsWith(googleLogin({ idToken: 'falso' }), { code: 'INVALID_GOOGLE_TOKEN' });
    assert.equal(findByEmail.mock.callCount(), 0);
  });

  test('usa el correo del token normalizado (minusculas, sin espacios)', async () => {
    const { googleLogin, findByEmail, create } = setup();
    await googleLogin({ ...SOCIAL_CONSENT, idToken: googleIdToken({ email: '  Ana@X.com ', name: 'Ana' }) });
    assert.deepEqual(argsOf(findByEmail), ['ana@x.com']);
    assert.equal(argsOf(create)[0].email, 'ana@x.com');
  });

  test('sin nombre en el token usa la parte local del correo', async () => {
    const { googleLogin, create } = setup();
    await googleLogin({ ...SOCIAL_CONSENT, idToken: googleIdToken({ email: 'ana.perez@x.com', name: null }) });
    assert.equal(argsOf(create)[0].name, 'ana.perez');
  });

  test('recorta nombres de mas de 120 caracteres', async () => {
    const { googleLogin, create } = setup();
    await googleLogin({ ...SOCIAL_CONSENT, idToken: googleIdToken({ email: 'a@x.com', name: 'n'.repeat(200) }) });
    assert.equal(argsOf(create)[0].name.length, 120);
  });
});

describe('google_login pide consentimiento al crear la cuenta (Ley 1581)', () => {
  const idToken = () => googleIdToken({ email: 'nueva@x.com', name: 'Nueva' });

  test('sin acceptedTerms: TERMS_REQUIRED 400 y no crea la cuenta', async () => {
    const { googleLogin, create } = setup();
    await rejectsWith(googleLogin({ idToken: idToken() }), { code: 'TERMS_REQUIRED', httpStatus: 400 });
    assert.equal(create.mock.callCount(), 0);
  });

  test('acceptedTerms sin version: TERMS_REQUIRED', async () => {
    const { googleLogin, create } = setup();
    await rejectsWith(googleLogin({ idToken: idToken(), acceptedTerms: true, termsVersion: '  ' }), { code: 'TERMS_REQUIRED' });
    assert.equal(create.mock.callCount(), 0);
  });

  test('con consentimiento guarda la version aceptada', async () => {
    const { googleLogin, create } = setup();
    await googleLogin({ ...SOCIAL_CONSENT, idToken: idToken() });
    assert.equal((argsOf(create)[0] as { termsVersion?: string }).termsVersion, '2025-01');
  });
});
