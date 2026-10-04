import { Env, makeEnvReader, requireJwtSecret } from '@traduce/shared';
import { SERVICE_NAMES, ServiceName } from './route_table';

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
}

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
  };
};
