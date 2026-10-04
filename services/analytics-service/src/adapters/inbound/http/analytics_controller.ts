import { Request, Response } from 'express';
import { AnalyticsError } from '../../../domain/rules';
import { AnalyticsService } from '../../../ports/inbound/analytics_service';

const HTTP_ACCEPTED = 202;

const fail = (res: Response, error: unknown) => {
  if (error instanceof AnalyticsError) {
    return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
  }
  console.error('[analytics]', error);
  return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
};

/** Envuelve un handler: una sola captura de errores en vez de un try/catch por ruta. */
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      fail(res, error);
    }
  };

export const makeAnalyticsController = (service: AnalyticsService) => ({
  recordEvent: handle(async (req, res) => {
    const body = req.body ?? {};
    await service.recordEvent({
      userId: req.user!.userId,
      section: body.section,
      eventType: body.eventType,
      sessionId: body.sessionId,
      referenceType: body.referenceType,
      referenceId: body.referenceId,
    });
    res.status(HTTP_ACCEPTED).json({ success: true });
  }),

  summary: handle(async (req, res) => {
    res.json({ success: true, data: await service.summary(req.query) });
  }),

  topSigns: handle(async (req, res) => {
    res.json({ success: true, data: await service.topSigns(req.query) });
  }),

  dailySeries: handle(async (req, res) => {
    res.json({ success: true, data: await service.dailySeries(req.query) });
  }),
});
