import { createHmac } from 'crypto';
import { FacebookTokenVerifier } from '../../../ports/outbound/facebook_token_verifier';
import { FacebookNotConfiguredError, InvalidFacebookTokenError } from '../../../domain/service';

const GRAPH_URL = 'https://graph.facebook.com/v23.0';
const REQUEST_TIMEOUT_MS = 5000;

export interface FacebookAppCredentials {
  appId: string;
  appSecret: string;
}

/** GET que devuelve el JSON de la Graph API; inyectable para tests. */
export type HttpGetJson = (url: string) => Promise<{ ok: boolean; body: unknown }>;

const fetchJson: HttpGetJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return { ok: response.ok, body: await response.json().catch(() => null) };
};

interface DebugTokenBody {
  data?: { is_valid?: boolean; app_id?: string; user_id?: string };
}

interface MeBody {
  id?: string;
  email?: string;
  name?: string;
}

/**
 * Valida el access token con la Graph API: debug_token comprueba que sea valido y emitido para esta app
 * (si no, un token de otra app serviria para entrar aqui); despues /me lee correo y nombre.
 */
export const makeFacebookTokenVerifier = (
  credentials: FacebookAppCredentials | null,
  httpGet: HttpGetJson = fetchJson
): FacebookTokenVerifier => ({
  verify: async (accessToken) => {
    if (!credentials) throw new FacebookNotConfiguredError();
    const { appId, appSecret } = credentials;

    const debug = await httpGet(`${GRAPH_URL}/debug_token?${new URLSearchParams({
      input_token: accessToken,
      access_token: `${appId}|${appSecret}`,
    })}`);
    const tokenData = (debug.body as DebugTokenBody | null)?.data;
    if (!debug.ok || tokenData?.is_valid !== true || tokenData.app_id !== appId || !tokenData.user_id) {
      throw new InvalidFacebookTokenError();
    }

    // appsecret_proof: Facebook rechaza la llamada si el token se usa sin el secreto de la app.
    const me = await httpGet(`${GRAPH_URL}/me?${new URLSearchParams({
      fields: 'id,name,email',
      access_token: accessToken,
      appsecret_proof: createHmac('sha256', appSecret).update(accessToken).digest('hex'),
    })}`);
    const profile = me.body as MeBody | null;
    if (!me.ok || !profile?.id || profile.id !== tokenData.user_id) throw new InvalidFacebookTokenError();

    return { email: profile.email?.trim() || null, name: profile.name?.trim() || null };
  },
});
