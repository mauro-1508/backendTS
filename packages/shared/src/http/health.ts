import { RequestHandler } from 'express';

/** Resultado de una comprobacion: `issue` (codigo estable) solo cuando algo queda sin procesar. */
export interface HealthCheckResult {
  issue?: string;
  /** Detalle para quien revisa la red interna; el gateway no lo publica. */
  details?: Record<string, unknown>;
}

export type HealthCheck = () => Promise<HealthCheckResult>;

/** Menor que el timeout del gateway (2 s) y que el del HEALTHCHECK de Docker (3 s). */
export const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 1_500;

const withTimeout = <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('la comprobacion tardo demasiado')), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
};

/**
 * GET /health de un servicio. Responde 200 mientras el proceso viva: con 503 el HEALTHCHECK de Docker
 * marcaria el contenedor como enfermo y el gateway no arrancaria (depends_on service_healthy).
 * Lo que deja datos sin procesar va en el cuerpo: `degraded` con sus `issues`. Una comprobacion que
 * falla o tarda cuenta como `<nombre>_unavailable`.
 */
export const makeServiceHealthHandler = (
  service: string,
  checks: Record<string, HealthCheck> = {},
  timeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
): RequestHandler =>
  async (_req, res) => {
    const results = await Promise.all(Object.entries(checks).map(async ([name, check]): Promise<[string, HealthCheckResult]> => {
      try {
        return [name, await withTimeout(check(), timeoutMs)];
      } catch {
        return [name, { issue: `${name}_unavailable` }];
      }
    }));
    const issues = results.flatMap(([, result]) => (result.issue ? [result.issue] : []));
    if (issues.length === 0) {
      res.json({ status: 'ok', service });
      return;
    }
    const details = Object.fromEntries(results.filter(([, result]) => result.details).map(([name, result]) => [name, result.details]));
    res.json({ status: 'degraded', service, issues, details });
  };
