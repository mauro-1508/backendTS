import { RequestHandler, Router } from 'express';
import { AnalyticsService } from '../../../ports/inbound/analytics_service';
import { makeAnalyticsController } from './analytics_controller';

export const makeAnalyticsRoutes = (deps: {
  analyticsService: AnalyticsService;
  authMiddleware: RequestHandler;
  /** Exige rol ADMIN; va despues de authMiddleware. */
  requireAdmin: RequestHandler;
}) => {
  const router = Router();
  const controller = makeAnalyticsController(deps.analyticsService);

  // Cualquier usuario autenticado registra eventos propios; los reportes son solo ADMIN.
  router.post('/events', deps.authMiddleware, controller.recordEvent);
  router.get('/summary', deps.authMiddleware, deps.requireAdmin, controller.summary);
  router.get('/top-signs', deps.authMiddleware, deps.requireAdmin, controller.topSigns);
  router.get('/daily', deps.authMiddleware, deps.requireAdmin, controller.dailySeries);

  return router;
};
