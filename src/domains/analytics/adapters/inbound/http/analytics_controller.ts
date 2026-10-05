import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AnalyticsService } from '../../../ports/inbound/analytics_service';
import { InvalidRangeError, InvalidUsageEventError, PermissionDeniedError } from '../../../domain/service';
import { recordEventBodySchema, sectionReportQuerySchema } from './dto/analytics_request';

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, code, message });

const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof z.ZodError || error instanceof InvalidUsageEventError || error instanceof InvalidRangeError) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Solicitud invalida');
  }
  if (error instanceof PermissionDeniedError) return fail(res, 403, 'PERMISSION_ERROR', 'Permiso insuficiente');
  return next(error);
};

// El usuario sale siempre del JWT (req.user); nunca de body/query.
export const makeAnalyticsController = (analyticsService: AnalyticsService) => ({
  recordEvent: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = recordEventBodySchema.parse(req.body ?? {});
      await analyticsService.recordUsageEvent({ ...body, userId: req.user!.userId });
      return res.status(201).json({ success: true });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  sectionReport: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = sectionReportQuerySchema.parse(req.query ?? {});
      const report = await analyticsService.getSectionReport({ ...query, userId: req.user!.userId });
      return res.status(200).json({ success: true, data: report });
    } catch (error) {
      return handleError(error, res, next);
    }
  },
});
