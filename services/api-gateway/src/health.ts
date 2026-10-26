import { RequestHandler } from 'express';
import { SERVICE_NAMES, ServiceName } from './route_table';

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json?: () => Promise<unknown> }>;

/**
 * `degraded`: el servicio responde, pero deja datos sin procesar (un evento atascado en el outbox,
 * mensajes en una cola `.dead`). Solo se publican los codigos; el detalle se queda en la red interna.
 */
export interface ServiceHealth {
  status: 'up' | 'degraded' | 'down';
  issues?: string[];
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  /** Version del backend desplegado (package.json raiz). */
  version: string;
  services: Record<ServiceName, ServiceHealth>;
}

export interface HealthDeps {
  serviceUrls: Record<ServiceName, string>;
  timeoutMs: number;
  fetchFn: FetchLike;
  version: string;
}

const ISSUE_CODE = /^[a-z_]{1,40}$/;

/** Cuerpo del /health de un servicio: sin `degraded` (o sin cuerpo legible) cuenta como `up`. */
const issuesOf = (body: unknown): ServiceHealth => {
  const { status, issues } = (typeof body === 'object' && body !== null ? body : {}) as { status?: unknown; issues?: unknown };
  if (status !== 'degraded') return { status: 'up' };
  const codes = Array.isArray(issues) ? issues.filter((code): code is string => typeof code === 'string' && ISSUE_CODE.test(code)) : [];
  return { status: 'degraded', issues: codes };
};

const checkService = async (url: string, { timeoutMs, fetchFn }: HealthDeps): Promise<ServiceHealth> => {
  try {
    const response = await fetchFn(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { status: 'down' };
    return issuesOf(await response.json?.().catch(() => undefined));
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
  return { status: allUp ? 'ok' : 'degraded', version: deps.version, services };
};

/** El gateway responde 200 mientras viva; el detalle de los servicios va en el cuerpo. */
export const makeHealthHandler = (deps: HealthDeps): RequestHandler =>
  async (_req, res) => {
    res.json(await buildHealthReport(deps));
  };
