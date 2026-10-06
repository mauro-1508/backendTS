import express, { Express, RequestHandler } from 'express';
import { errorHandler } from '@traduce/shared';
import { makeAuthModule, AuthModuleDeps } from './auth/auth.module';
import { makeUsersModule, UsersModuleDeps } from './users/users.module';
import { makeIamModule } from './iam/iam.module';
import { IamRepository } from './iam/ports/outbound/iam_repository';
import { Access } from './auth/ports/outbound/role_reader';

const SERVICE_NAME = 'iam-service';
const JSON_BODY_LIMIT = '2mb';
const AUTH_ROUTE = '/api/auth';
const USERS_ROUTE = '/api/users';
const IAM_ROUTE = '/api/iam';

export type IamAppDeps = Omit<AuthModuleDeps, 'roleAssigner' | 'roleReader'> &
  Omit<UsersModuleDeps, 'permissionChecker' | 'adminGuard'> & {
    iamRepository: IamRepository;
    authMiddleware: RequestHandler;
  };

export const makeIamApp = (deps: IamAppDeps): Express => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const health: RequestHandler = (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  };
  app.get('/health', health);

  // auth y users no conocen iam: reciben adaptadores que cumplen sus puertos.
  const iam = makeIamModule(deps);
  const roleAssigner = { assignDefaultRole: iam.iamService.assignDefaultRole };
  const roleReader = {
    readAccess: async (userId: number): Promise<Access> =>
      (await iam.iamService.getMyAccess({ userId })).data as Access,
  };
  const permissionChecker = { hasPermission: iam.iamService.hasPermission };
  const adminGuard = { isLastAdmin: iam.iamService.isLastAdmin };

  app.use(IAM_ROUTE, iam.router);
  app.use(AUTH_ROUTE, makeAuthModule({ ...deps, roleAssigner, roleReader }).router);
  app.use(USERS_ROUTE, makeUsersModule({ ...deps, permissionChecker, adminGuard }).router);
  app.use(errorHandler);
  return app;
};
