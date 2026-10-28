import express, { Express } from 'express';
import { errorHandler, HealthCheck, makeServiceHealthHandler } from '@traduce/shared';
import { makeAnalyticsModule } from './analytics.module';

const SERVICE_NAME = 'analytics-service';
const JSON_BODY_LIMIT = '100kb';
const ANALYTICS_ROUTE = '/api/analytics';

/** `healthChecks`: comprobaciones de GET /health (p. ej. las colas `.dead`); sin ellas responde siempre ok. */
export const makeAnalyticsApp = (
  deps: Parameters<typeof makeAnalyticsModule>[0],
  healthChecks?: Record<string, HealthCheck>,
): Express => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/health', makeServiceHealthHandler(SERVICE_NAME, healthChecks));

  app.use(ANALYTICS_ROUTE, makeAnalyticsModule(deps).router);
  app.use(errorHandler);
  return app;
};
