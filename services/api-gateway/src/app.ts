import cors from 'cors';
import express, { Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TokenProvider } from '@traduce/shared';
import { makeCorsOptions } from './cors_options';
import { GatewayConfig, RateLimitConfig } from './config';
import { FetchLike, makeHealthHandler } from './health';
import { makeOptionalAuth } from './optional_auth';
import { makeServiceProxies } from './proxies';
import { UNKNOWN_VERSION } from './version';

export interface GatewayDeps {
  config: Pick<GatewayConfig, 'serviceUrls' | 'rateLimit' | 'authRateLimit' | 'healthTimeoutMs' | 'corsOrigins'>
    & Partial<Pick<GatewayConfig, 'trustProxy' | 'version'>>;
  tokenProvider: TokenProvider;
  fetchFn?: FetchLike;
}

/**
 * `/health` para Docker y la red interna; `/api/health` para afuera, porque
 * Caddy solo manda al gateway lo que empieza por /api y no recorta la ruta.
 */
const HEALTH_PATHS = ['/health', '/api/health'];
/** Endpoints de /api/auth que se pueden usar para adivinar credenciales o códigos, o para crear cuentas en masa. */
const SENSITIVE_AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/verify-code',
  '/api/auth/reset-password',
  '/api/auth/google',
  '/api/auth/facebook',
];
const RATE_LIMITED_BODY = { success: false, code: 'RATE_LIMITED', message: 'Demasiadas peticiones, intenta más tarde' };

const makeLimiter = ({ windowMs, maxRequests }: RateLimitConfig) => rateLimit({
  windowMs,
  limit: maxRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: RATE_LIMITED_BODY,
});

export const makeGatewayApp = ({ config, tokenProvider, fetchFn = fetch }: GatewayDeps): Express => {
  const app = express();
  // Solo se confia en X-Forwarded-For si hay un proxy propio delante: si no, cualquiera podria falsear su IP.
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(cors(makeCorsOptions(config.corsOrigins)));
  app.get(HEALTH_PATHS, makeHealthHandler({
    serviceUrls: config.serviceUrls, timeoutMs: config.healthTimeoutMs, fetchFn,
    version: config.version ?? UNKNOWN_VERSION,
  }));

  app.use(SENSITIVE_AUTH_PATHS, makeLimiter(config.authRateLimit));
  app.use(makeLimiter(config.rateLimit));
  app.use(makeOptionalAuth(tokenProvider));

  // No se parsea el cuerpo (no hay express.json): el proxy lo reenvia tal cual.
  app.use(...makeServiceProxies(config.serviceUrls));

  app.use((_req, res) => {
    res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Ruta no encontrada' });
  });

  return app;
};
