import { Env, makeEnvReader } from '@traduce/shared';
import { FacebookAppCredentials } from './auth/adapters/outbound/facebook/facebook_token_verifier';

export interface MailerConfig {
  service: string;
  user: string | undefined;
  pass: string | undefined;
}

const ENV_PREFIX = 'IAM';
const MAIL_SERVICE = 'gmail';

/** Unico lugar que lee EMAIL_USER y EMAIL_PASS (credenciales del correo de recuperacion). */
export const loadMailerConfig = (env: Env = process.env): MailerConfig => {
  const read = makeEnvReader(env, ENV_PREFIX);
  return { service: MAIL_SERVICE, user: read('EMAIL_USER'), pass: read('EMAIL_PASS') };
};

/**
 * Client IDs de OAuth de Google (web, Android, iOS) separados por comas: son la audiencia que debe tener el ID token.
 * Vacio = POST /auth/google responde 503 GOOGLE_NOT_CONFIGURED.
 */
export const loadGoogleClientIds = (env: Env = process.env): string[] => {
  const read = makeEnvReader(env, ENV_PREFIX);
  return (read('GOOGLE_CLIENT_IDS') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
};

/**
 * App ID y App Secret de Facebook (developers.facebook.com). El secreto solo vive aqui, nunca en el frontend.
 * Si falta alguno = POST /auth/facebook responde 503 FACEBOOK_NOT_CONFIGURED.
 */
export const loadFacebookCredentials = (env: Env = process.env): FacebookAppCredentials | null => {
  const read = makeEnvReader(env, ENV_PREFIX);
  const appId = read('FACEBOOK_APP_ID')?.trim();
  const appSecret = read('FACEBOOK_APP_SECRET')?.trim();
  return appId && appSecret ? { appId, appSecret } : null;
};
