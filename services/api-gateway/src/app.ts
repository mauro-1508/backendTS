import cors from 'cors';
import express, { Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TokenProvider } from '@traduce/shared';
import { GatewayConfig, RateLimitConfig } from './config';
import { FetchLike, makeHealthHandler } from './health';
import { makeOptionalAuth } from './optional_auth';
import { makeServiceProxies } from './proxies';

export interface GatewayDeps {
  config: Pick<GatewayConfig, 'serviceUrls' | 'rateLimit' | 'authRateLimit' | 'healthTimeoutMs'>;
  tokenProvider: TokenProvider;
  fetchFn?: FetchLike;
}

const HEALTH_PATH = '/health';
/** Endpoints de /api/auth que se pueden usar para adivinar credenciales o códigos. */
const SENSITIVE_AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/verify-code',
  '/api/auth/reset-password',
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

  app.use(cors());
  app.get(HEALTH_PATH, makeHealthHandler({
    serviceUrls: config.serviceUrls, timeoutMs: config.healthTimeoutMs, fetchFn,
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
