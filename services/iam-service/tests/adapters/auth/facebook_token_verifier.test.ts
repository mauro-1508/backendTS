import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { HttpGetJson, makeFacebookTokenVerifier } from '../../../src/auth/adapters/outbound/facebook/facebook_token_verifier';
import { rejectsWith } from '../../helpers/fakes';

type GraphResponse = { ok: boolean; body: unknown };

const credentials = { appId: 'app-1', appSecret: 'secreto' };
const tokenData = { is_valid: true, app_id: 'app-1', user_id: 'fb-9' };
const validDebug: GraphResponse = { ok: true, body: { data: tokenData } };
const profile = { id: 'fb-9', email: 'ana@example.com', name: ' Ana ' };
const validMe: GraphResponse = { ok: true, body: profile };

/** Responde debug_token y /me con lo indicado; guarda las URLs pedidas. */
const graph = (debug: GraphResponse, me: GraphResponse = validMe) => {
  const httpGet = mock.fn<HttpGetJson>(async (url) => (url.includes('/debug_token?') ? debug : me));
  const urls = () => httpGet.mock.calls.map((call) => new URL(call.arguments[0]));
  return { httpGet, urls };
};

describe('facebook_token_verifier', () => {
  test('token valido de esta app: devuelve correo y nombre recortado; firma /me con appsecret_proof', async () => {
    const { httpGet, urls } = graph(validDebug);
    const identity = await makeFacebookTokenVerifier(credentials, httpGet).verify('tok');
    assert.deepEqual(identity, { email: 'ana@example.com', name: 'Ana' });
    const [debugUrl, meUrl] = urls();
    assert.equal(debugUrl.searchParams.get('input_token'), 'tok');
    assert.equal(debugUrl.searchParams.get('access_token'), 'app-1|secreto');
    assert.equal(meUrl.searchParams.get('access_token'), 'tok');
    assert.equal(meUrl.searchParams.get('appsecret_proof'), createHmac('sha256', 'secreto').update('tok').digest('hex'));
  });

  test('sin credenciales: FACEBOOK_NOT_CONFIGURED (503) sin llamar a Facebook', async () => {
    const { httpGet } = graph(validDebug);
    await rejectsWith(makeFacebookTokenVerifier(null, httpGet).verify('tok'), { code: 'FACEBOOK_NOT_CONFIGURED', httpStatus: 503 });
    assert.equal(httpGet.mock.callCount(), 0);
  });

  test('token de otra app, invalido o rechazado: INVALID_FACEBOOK_TOKEN sin leer el perfil', async () => {
    const cases: GraphResponse[] = [
      { ok: true, body: { data: { ...tokenData, app_id: 'otra-app' } } },
      { ok: true, body: { data: { ...tokenData, is_valid: false } } },
      { ok: true, body: { data: { ...tokenData, user_id: undefined } } },
      { ok: false, body: { error: { message: 'Invalid OAuth access token' } } },
      { ok: true, body: null },
    ];
    for (const debug of cases) {
      const { httpGet } = graph(debug);
      await rejectsWith(makeFacebookTokenVerifier(credentials, httpGet).verify('tok'),
        { code: 'INVALID_FACEBOOK_TOKEN', httpStatus: 401, message: 'Token de Facebook inválido' });
      assert.equal(httpGet.mock.callCount(), 1);
    }
  });

  test('/me falla o es de otro usuario: INVALID_FACEBOOK_TOKEN', async () => {
    for (const me of [{ ok: false, body: {} }, { ok: true, body: { ...profile, id: 'fb-otro' } }]) {
      await rejectsWith(makeFacebookTokenVerifier(credentials, graph(validDebug, me).httpGet).verify('tok'), { code: 'INVALID_FACEBOOK_TOKEN' });
    }
  });

  test('perfil sin correo y con nombre vacio: ambos quedan en null', async () => {
    const { httpGet } = graph(validDebug, { ok: true, body: { id: 'fb-9', name: '  ' } });
    assert.deepEqual(await makeFacebookTokenVerifier(credentials, httpGet).verify('tok'), { email: null, name: null });
  });
});
