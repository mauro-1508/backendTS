import { Env, makeEnvReader } from '@traduce/shared';

export interface RecognitionConfig {
  /** Vacio = muestras en memoria (sin MongoDB). */
  mongoUrl: string;
}

const ENV_PREFIX = 'RECOGNITION';

/** Unico lugar que lee MONGO_URL (RECOGNITION_MONGO_URL gana sobre MONGO_URL). */
export const loadRecognitionConfig = (env: Env = process.env): RecognitionConfig => {
  const read = makeEnvReader(env, ENV_PREFIX);
  return { mongoUrl: read('MONGO_URL') ?? '' };
};
