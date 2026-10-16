import { OAuth2Client } from 'google-auth-library';
import { GoogleTokenVerifier } from '../../../ports/outbound/google_token_verifier';
import { GoogleNotConfiguredError, InvalidGoogleTokenError } from '../../../domain/service';

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

interface GooglePayload {
  iss?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export interface IdTokenClient {
  verifyIdToken(options: { idToken: string; audience: string[] }): Promise<{ getPayload(): GooglePayload | undefined }>;
}

/** Verifica el ID token con la libreria oficial de Google (firma con las claves publicas de Google). */
export const makeGoogleTokenVerifier = (
  clientIds: string[],
  client: IdTokenClient = new OAuth2Client() as unknown as IdTokenClient
): GoogleTokenVerifier => ({
  verify: async (idToken) => {
    if (clientIds.length === 0) throw new GoogleNotConfiguredError();
    let payload: GooglePayload | undefined;
    try {
      payload = (await client.verifyIdToken({ idToken, audience: clientIds })).getPayload();
    } catch {
      // Firma, caducidad o audiencia invalidas: el detalle no sale al cliente.
      throw new InvalidGoogleTokenError();
    }
    if (!payload?.iss || !ISSUERS.includes(payload.iss) || !payload.email) throw new InvalidGoogleTokenError();
    return { email: payload.email, emailVerified: payload.email_verified === true, name: payload.name?.trim() || null };
  },
});
