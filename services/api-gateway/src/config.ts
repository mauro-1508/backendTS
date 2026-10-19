import { Env, makeEnvReader, requireJwtSecret } from '@traduce/shared';
import { resolveCorsOrigins } from './cors_options';
import { SERVICE_NAMES, ServiceName } from './route_table';
import { readBackendVersion } from './version';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface GatewayConfig {
  port: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  serviceUrls: Record<ServiceName, string>;
  rateLimit: RateLimitConfig;
  /** Limite estricto para los endpoints sensibles de /api/auth. */
  authRateLimit: RateLimitConfig;
  healthTimeoutMs: number;
  /** Origenes con permiso CORS (lista blanca). */
  corsOrigins: string[];
  /**
   * Proxies inversos de confianza delante del gateway (p. ej. 1 con Caddy). Con 0 se ignora X-Forwarded-For;
   * detras de un proxy hace falta para que el rate limit cuente por IP de cliente y no por la del proxy.
   */
  trustProxy: number;
  /** Version del backend que informa GET /health (package.json raiz). */
  version: string;
}

const PRODUCTION_ENV = 'production';
const DEFAULT_PORT = 8080;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_MAX_REQUESTS = 300;
const DEFAULT_AUTH_RATE_MAX_REQUESTS = 10;
const DEFAULT_HEALTH_TIMEOUT_MS = 2_000;

/** Puertos por defecto de cada servicio en desarrollo local. */
const DEFAULT_SERVICE_URLS: Record<ServiceName, string> = {
  iam: 'http://localhost:3001',
  recognition: 'http://localhost:3002',
  lexicon: 'http://localhost:3003',
  analytics: 'http://localhost:3004',
  profile: 'http://localhost:3005',
};

/** `IAM_SERVICE_URL`, `RECOGNITION_SERVICE_URL`, ... */
export const serviceUrlVariable = (service: ServiceName): string => `${service.toUpperCase()}_SERVICE_URL`;

/** Numero de proxies de confianza; cualquier valor no entero o negativo cuenta como 0 (no confiar). */
export const parseTrustProxy = (raw: string | undefined): number => {
  const hops = Number(raw);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
};

export const loadGatewayConfig = (env: Env = process.env): GatewayConfig => {
  const read = makeEnvReader(env);
  const serviceUrls = Object.fromEntries(
    SERVICE_NAMES.map(name => [name, read(serviceUrlVariable(name)) ?? DEFAULT_SERVICE_URLS[name]]),
  ) as Record<ServiceName, string>;

  return {
    port: Number(read('PORT')) || DEFAULT_PORT,
    jwtSecret: requireJwtSecret(read('JWT_SECRET')),
    jwtExpiresIn: read('JWT_EXPIRES_IN') ?? '1d',
    serviceUrls,
    rateLimit: {
      windowMs: Number(read('RATE_LIMIT_WINDOW_MS')) || DEFAULT_RATE_WINDOW_MS,
      maxRequests: Number(read('RATE_LIMIT_MAX')) || DEFAULT_RATE_MAX_REQUESTS,
    },
    authRateLimit: {
      windowMs: Number(read('AUTH_RATE_LIMIT_WINDOW_MS')) || DEFAULT_RATE_WINDOW_MS,
      maxRequests: Number(read('AUTH_RATE_LIMIT_MAX')) || DEFAULT_AUTH_RATE_MAX_REQUESTS,
    },
    healthTimeoutMs: Number(read('HEALTH_TIMEOUT_MS')) || DEFAULT_HEALTH_TIMEOUT_MS,
    corsOrigins: resolveCorsOrigins(read('CORS_ORIGINS'), read('NODE_ENV') === PRODUCTION_ENV),
    trustProxy: parseTrustProxy(read('TRUST_PROXY')),
    version: readBackendVersion(),
  };
};
