import { RequestHandler, Router } from 'express';
import { AnalyticsService } from '../../../ports/inbound/analytics_service';
import { makeAnalyticsController } from './analytics_controller';

export const makeAnalyticsRoutes = (deps: { analyticsService: AnalyticsService; authMiddleware: RequestHandler }) => {
  const router = Router();
  const controller = makeAnalyticsController(deps.analyticsService);

  router.use(deps.authMiddleware);
  router.post('/events', controller.recordEvent);
  router.get('/reports/sections', controller.sectionReport);

  return router;
};
