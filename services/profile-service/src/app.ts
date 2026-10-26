import express, { Express } from 'express';
import { errorHandler, HealthCheck, makeServiceHealthHandler } from '@traduce/shared';
import { makeProfileModule } from './profile.module';

const SERVICE_NAME = 'profile-service';
const JSON_BODY_LIMIT = '100kb';

/** `healthChecks`: comprobaciones de GET /health (p. ej. las colas `.dead`); sin ellas responde siempre ok. */
export const makeProfileApp = (
  profileModule: ReturnType<typeof makeProfileModule>,
  healthChecks?: Record<string, HealthCheck>,
): Express => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/health', makeServiceHealthHandler(SERVICE_NAME, healthChecks));

  app.use('/api/profile', profileModule.routers.profile);
  app.use('/api/achievements', profileModule.routers.achievements);
  app.use('/api/notifications', profileModule.routers.notifications);
  app.use(errorHandler);
  return app;
};
