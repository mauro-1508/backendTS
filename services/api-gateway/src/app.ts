import cors from 'cors';
import express, { Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TokenProvider } from '@traduce/shared';
import { GatewayConfig } from './config';
import { FetchLike, makeHealthHandler } from './health';
import { makeOptionalAuth } from './optional_auth';
import { makeServiceProxies } from './proxies';

export interface GatewayDeps {
  config: Pick<GatewayConfig, 'serviceUrls' | 'rateLimit' | 'healthTimeoutMs'>;
  tokenProvider: TokenProvider;
  fetchFn?: FetchLike;
}

const HEALTH_PATH = '/health';

export const makeGatewayApp = ({ config, tokenProvider, fetchFn = fetch }: GatewayDeps): Express => {
  const app = express();

  app.use(cors());
  app.get(HEALTH_PATH, makeHealthHandler({
    serviceUrls: config.serviceUrls, timeoutMs: config.healthTimeoutMs, fetchFn,
  }));

  app.use(rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.maxRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, code: 'RATE_LIMITED', message: 'Demasiadas peticiones, intenta más tarde' },
  }));
  app.use(makeOptionalAuth(tokenProvider));

  // No se parsea el cuerpo (no hay express.json): el proxy lo reenvia tal cual.
  app.use(...makeServiceProxies(config.serviceUrls));

  app.use((_req, res) => {
    res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Ruta no encontrada' });
  });

  return app;
};
