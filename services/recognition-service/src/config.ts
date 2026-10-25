import { Env, makeEnvReader } from '@traduce/shared';
import { DEFAULT_RETENTION_DAYS } from './translations/application/purge_expired_translations';

export interface RecognitionConfig {
  /** Vacio = muestras en memoria (sin MongoDB). */
  mongoUrl: string;
  /** Dias que se guardan las traducciones; 0 = no se borran (TRANSLATION_RETENTION_DAYS). */
  translationRetentionDays: number;
}

const ENV_PREFIX = 'RECOGNITION';

/** Un valor vacio o invalido usa los 30 dias por defecto: un error de escritura no borra el historial. */
const parseRetentionDays = (value: string | undefined): number => {
  if (value === undefined || value.trim() === '') return DEFAULT_RETENTION_DAYS;
  const days = Number(value);
  return Number.isInteger(days) && days >= 0 ? days : DEFAULT_RETENTION_DAYS;
};

/** Unico lugar que lee MONGO_URL y TRANSLATION_RETENTION_DAYS (con prefijo RECOGNITION_ gana). */
export const loadRecognitionConfig = (env: Env = process.env): RecognitionConfig => {
  const read = makeEnvReader(env, ENV_PREFIX);
  return {
    mongoUrl: read('MONGO_URL') ?? '',
    translationRetentionDays: parseRetentionDays(read('TRANSLATION_RETENTION_DAYS')),
  };
};
