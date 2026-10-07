import express, { Express, RequestHandler } from 'express';
import { errorHandler } from '@traduce/shared';
import { makeAnalyticsModule } from './analytics.module';

const SERVICE_NAME = 'analytics-service';
const JSON_BODY_LIMIT = '100kb';
const ANALYTICS_ROUTE = '/api/analytics';

export const makeAnalyticsApp = (deps: Parameters<typeof makeAnalyticsModule>[0]): Express => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const health: RequestHandler = (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  };
  app.get('/health', health);

  app.use(ANALYTICS_ROUTE, makeAnalyticsModule(deps).router);
  app.use(errorHandler);
  return app;
};
