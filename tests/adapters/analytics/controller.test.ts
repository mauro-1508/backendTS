import { describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';
import { makeAnalyticsController } from '../../../src/domains/analytics/adapters/inbound/http/analytics_controller';
import { recordEventBodySchema, sectionReportQuerySchema } from '../../../src/domains/analytics/adapters/inbound/http/dto/analytics_request';
import { PermissionDeniedError } from '../../../src/domains/analytics/domain/service';
import { makeAnalyticsRoutes } from '../../../src/domains/analytics/adapters/inbound/http/routes';
import { makeAuthMiddleware } from '../../../src/shared/http/auth_middleware';
import { AnalyticsService } from '../../../src/domains/analytics/ports/inbound/analytics_service';

const makeRes = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};
const makeService = (over: Partial<AnalyticsService> = {}): AnalyticsService => ({
  recordUsageEvent: vi.fn().mockResolvedValue(undefined),
  getSectionReport: vi.fn().mockResolvedValue({ from: 'a', to: 'b', sections: [] }),
  ...over,
});
const req = (over: object) => ({ user: { userId: 7, email: 'a@b.c' }, ...over }) as unknown as Request;

describe('esquemas zod de analytics', () => {
  it('valida el body de eventos', () => {
    expect(recordEventBodySchema.safeParse({ section: 'HOME', eventType: 'SECTION_VIEW' }).success).toBe(true);
    expect(recordEventBodySchema.safeParse({ section: 'HOME', eventType: 'SECTION_VIEW', referenceType: 'SIGN', referenceId: 2147483647 }).success).toBe(true);
    for (const bad of [
      { section: 'HOME', eventType: 'SECTION_VIEW', referenceType: 'juan@correo.com', referenceId: 1 },
      { section: 'X', eventType: 'SECTION_VIEW' },
      { section: 'HOME', eventType: 'X' },
      { section: 'HOME', eventType: 'SECTION_VIEW', referenceType: 'SIGN' },
      { section: 'HOME', eventType: 'SECTION_VIEW', referenceType: 'SIGN', referenceId: 0 },
      { section: 'HOME', eventType: 'SECTION_VIEW', referenceType: 'SIGN', referenceId: 2147483648 },
      { section: 'HOME', eventType: 'SECTION_VIEW', referenceType: 'SIGN', referenceId: 1.5 },
    ]) expect(recordEventBodySchema.safeParse(bad).success).toBe(false);
  });

  it('valida from/to como fecha o fecha-hora ISO opcionales', () => {
    expect(sectionReportQuerySchema.safeParse({}).success).toBe(true);
    expect(sectionReportQuerySchema.safeParse({ from: '2026-09-01', to: '2026-09-10T10:00:00Z' }).success).toBe(true);
    expect(sectionReportQuerySchema.safeParse({ from: 'ayer' }).success).toBe(false);
  });
});

describe('analytics controller', () => {
  it('body undefined -> 400 sin llamar al servicio', async () => {
    const service = makeService();
    const res = makeRes();
    await makeAnalyticsController(service).recordEvent(req({ body: undefined }), res as unknown as Response, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(service.recordUsageEvent).not.toHaveBeenCalled();
  });

  it('201 y usa el userId del token, ignorando uno del body', async () => {
    const service = makeService();
    const res = makeRes();
    await makeAnalyticsController(service).recordEvent(
      req({ body: { section: 'HOME', eventType: 'SECTION_VIEW', userId: 99 } }), res as unknown as Response, vi.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(service.recordUsageEvent).toHaveBeenCalledWith({ section: 'HOME', eventType: 'SECTION_VIEW', userId: 7 });
  });

  it('PermissionDeniedError -> 403 PERMISSION_ERROR', async () => {
    const service = makeService({ getSectionReport: vi.fn().mockRejectedValue(new PermissionDeniedError('x')) });
    const res = makeRes();
    await makeAnalyticsController(service).sectionReport(req({ query: {} }), res as unknown as Response, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'PERMISSION_ERROR', message: 'Permiso insuficiente' });
  });

  it('query invalida -> 400; exito -> 200; error desconocido -> next', async () => {
    const res = makeRes();
    await makeAnalyticsController(makeService()).sectionReport(req({ query: { from: 'x' } }), res as unknown as Response, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);

    const ok = makeRes();
    await makeAnalyticsController(makeService()).sectionReport(req({ query: {} }), ok as unknown as Response, vi.fn());
    expect(ok.status).toHaveBeenCalledWith(200);

    const boom = new Error('db');
    const next = vi.fn();
    await makeAnalyticsController(makeService({ getSectionReport: vi.fn().mockRejectedValue(boom) }))
      .sectionReport(req({ query: {} }), makeRes() as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe('rutas de analytics sin JWT', () => {
  it('POST /events y GET /reports/sections -> 401 sin llamar al servicio', () => {
    const service = makeService();
    const router = makeAnalyticsRoutes({
      analyticsService: service,
      authMiddleware: makeAuthMiddleware({ sign: vi.fn(), verify: vi.fn() } as never),
    });
    for (const [method, url] of [['POST', '/events'], ['GET', '/reports/sections']]) {
      const res = makeRes();
      const next = vi.fn();
      router.handle({ method, url, headers: {}, query: {}, body: {} } as never, res as unknown as Response, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
    expect(service.recordUsageEvent).not.toHaveBeenCalled();
    expect(service.getSectionReport).not.toHaveBeenCalled();
  });
});
