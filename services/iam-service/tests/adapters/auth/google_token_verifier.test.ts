import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { IdTokenClient, makeGoogleTokenVerifier } from '../../../src/auth/adapters/outbound/google/google_token_verifier';
import { argsOf, rejectsWith } from '../../helpers/fakes';

const payload = { iss: 'https://accounts.google.com', email: 'ana@example.com', email_verified: true, name: ' Ana ' };

const clientReturning = (p: object | undefined) => {
  const verifyIdToken = mock.fn(async (_o: { idToken: string; audience: string[] }) => ({ getPayload: () => p }));
  return { client: { verifyIdToken } as IdTokenClient, verifyIdToken };
};

describe('google_token_verifier', () => {
  test('token valido: devuelve correo, verificacion y nombre recortado; pasa los client IDs como audiencia', async () => {
    const { client, verifyIdToken } = clientReturning(payload);
    const identity = await makeGoogleTokenVerifier(['web-id', 'android-id'], client).verify('tok');
    assert.deepEqual(identity, { email: 'ana@example.com', emailVerified: true, name: 'Ana' });
    assert.deepEqual(argsOf(verifyIdToken), [{ idToken: 'tok', audience: ['web-id', 'android-id'] }]);
  });

  test('sin client IDs configurados: GOOGLE_NOT_CONFIGURED (503) sin llamar a Google', async () => {
    const { client, verifyIdToken } = clientReturning(payload);
    await rejectsWith(makeGoogleTokenVerifier([], client).verify('tok'), { code: 'GOOGLE_NOT_CONFIGURED', httpStatus: 503 });
    assert.equal(verifyIdToken.mock.callCount(), 0);
  });

  test('firma, caducidad o audiencia invalidas: INVALID_GOOGLE_TOKEN sin filtrar el detalle', async () => {
    const client = { verifyIdToken: async () => { throw new Error('Wrong recipient, payload audience != requiredAudience'); } };
    await rejectsWith(makeGoogleTokenVerifier(['web-id'], client).verify('tok'),
      { code: 'INVALID_GOOGLE_TOKEN', httpStatus: 401, message: 'Token de Google inválido' });
  });

  test('emisor ajeno a Google: INVALID_GOOGLE_TOKEN', async () => {
    const { client } = clientReturning({ ...payload, iss: 'https://evil.example.com' });
    await rejectsWith(makeGoogleTokenVerifier(['web-id'], client).verify('tok'), { code: 'INVALID_GOOGLE_TOKEN' });
  });

  test('sin correo o sin payload: INVALID_GOOGLE_TOKEN', async () => {
    for (const p of [{ ...payload, email: undefined }, undefined]) {
      await rejectsWith(makeGoogleTokenVerifier(['web-id'], clientReturning(p).client).verify('tok'), { code: 'INVALID_GOOGLE_TOKEN' });
    }
  });

  test('email_verified ausente cuenta como no verificado; nombre vacio queda en null', async () => {
    const { client } = clientReturning({ ...payload, email_verified: undefined, name: '  ' });
    assert.deepEqual(await makeGoogleTokenVerifier(['web-id'], client).verify('tok'),
      { email: 'ana@example.com', emailVerified: false, name: null });
  });
});
