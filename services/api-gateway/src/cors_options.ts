import { CorsOptions } from 'cors';

/** Origenes de Expo web (Metro y webpack) permitidos cuando no se define CORS_ORIGINS fuera de produccion. */
export const DEV_CORS_ORIGINS: readonly string[] = ['http://localhost:8081', 'http://localhost:19006'];

const ORIGIN_SEPARATOR = ',';

/**
 * Lista blanca desde `CORS_ORIGINS` (separada por comas). Sin ella, en desarrollo se
 * permiten los origenes de Expo web y en produccion ninguno (las apps nativas no
 * envian `Origin`, asi que no dependen de CORS).
 */
export const resolveCorsOrigins = (raw: string | undefined, isProduction: boolean): string[] => {
  const configured = (raw ?? '').split(ORIGIN_SEPARATOR).map(origin => origin.trim()).filter(Boolean);
  if (configured.length > 0) return configured;
  return isProduction ? [] : [...DEV_CORS_ORIGINS];
};

export const makeCorsOptions = (allowedOrigins: readonly string[]): CorsOptions => ({
  // Un origen no permitido simplemente no recibe cabeceras CORS y el navegador lo bloquea.
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
});
