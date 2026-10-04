import express, { Express } from 'express';
import { errorHandler } from '@traduce/shared';
import { makeProfileModule } from './profile.module';

const SERVICE_NAME = 'profile-service';
const JSON_BODY_LIMIT = '100kb';

export const makeProfileApp = (profileModule: ReturnType<typeof makeProfileModule>): Express => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/health', (_req, res) => { res.json({ status: 'ok', service: SERVICE_NAME }); });

  app.use('/api/profile', profileModule.routers.profile);
  app.use('/api/achievements', profileModule.routers.achievements);
  app.use('/api/notifications', profileModule.routers.notifications);
  app.use(errorHandler);
  return app;
};
