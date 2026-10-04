import { Env, makeEnvReader } from '@traduce/shared';

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
