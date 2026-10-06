import { RequestHandler } from 'express';
import { SERVICE_NAMES, ServiceName } from './route_table';

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean }>;

export interface ServiceHealth {
  status: 'up' | 'down';
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  services: Record<ServiceName, ServiceHealth>;
}

export interface HealthDeps {
  serviceUrls: Record<ServiceName, string>;
  timeoutMs: number;
  fetchFn: FetchLike;
}

const checkService = async (url: string, { timeoutMs, fetchFn }: HealthDeps): Promise<ServiceHealth> => {
  try {
    const response = await fetchFn(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return { status: response.ok ? 'up' : 'down' };
  } catch {
    return { status: 'down' };
  }
};

export const buildHealthReport = async (deps: HealthDeps): Promise<HealthReport> => {
  const checks = await Promise.all(
    SERVICE_NAMES.map(async name => [name, await checkService(deps.serviceUrls[name], deps)] as const),
  );
  const services = Object.fromEntries(checks) as Record<ServiceName, ServiceHealth>;
  const allUp = checks.every(([, health]) => health.status === 'up');
  return { status: allUp ? 'ok' : 'degraded', services };
};

/** El gateway responde 200 mientras viva; el detalle de los servicios va en el cuerpo. */
export const makeHealthHandler = (deps: HealthDeps): RequestHandler =>
  async (_req, res) => {
    res.json(await buildHealthReport(deps));
  };
