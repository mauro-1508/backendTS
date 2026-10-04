import express, { Express, RequestHandler } from 'express';
import { errorHandler } from '@traduce/shared';
import { makeAuthModule, AuthModuleDeps } from './auth/auth.module';
import { makeUsersModule } from './users/users.module';

const SERVICE_NAME = 'iam-service';
const JSON_BODY_LIMIT = '2mb';
const AUTH_ROUTE = '/api/auth';
const USERS_ROUTE = '/api/users';

export type IamAppDeps = AuthModuleDeps & { authMiddleware: RequestHandler };

export const makeIamApp = (deps: IamAppDeps): Express => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const health: RequestHandler = (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  };
  app.get('/health', health);

  app.use(AUTH_ROUTE, makeAuthModule(deps).router);
  app.use(USERS_ROUTE, makeUsersModule(deps).router);
  app.use(errorHandler);
  return app;
};
