import express, { Express, RequestHandler } from 'express';
import { errorHandler, HealthCheck, makeServiceHealthHandler } from '@traduce/shared';
import { makeAuthModule, AuthModuleDeps } from './auth/auth.module';
import { makeAccountDeletionCodes } from './auth/application/account_deletion_codes';
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
  Omit<UsersModuleDeps, 'permissionChecker' | 'adminGuard' | 'deletionCodes'> & {
    iamRepository: IamRepository;
    authMiddleware: RequestHandler;
    /** Comprobaciones de GET /health (p. ej. el outbox); sin ellas responde siempre ok. */
    healthChecks?: Record<string, HealthCheck>;
  };

export const makeIamApp = (deps: IamAppDeps): Express => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/health', makeServiceHealthHandler(SERVICE_NAME, deps.healthChecks));

  // auth y users no conocen iam: reciben adaptadores que cumplen sus puertos.
  const iam = makeIamModule(deps);
  const roleAssigner = { assignDefaultRole: iam.iamService.assignDefaultRole };
  const roleReader = {
    readAccess: async (userId: number): Promise<Access> =>
      (await iam.iamService.getMyAccess({ userId })).data as Access,
  };
  const permissionChecker = { hasPermission: iam.iamService.hasPermission };
  const adminGuard = { isLastAdmin: iam.iamService.isLastAdmin };
  // users confirma el borrado de cuentas sin contraseña con codigos que emite y comprueba auth.
  const deletionCodes = makeAccountDeletionCodes(deps);

  app.use(IAM_ROUTE, iam.router);
  app.use(AUTH_ROUTE, makeAuthModule({ ...deps, roleAssigner, roleReader }).router);
  app.use(USERS_ROUTE, makeUsersModule({ ...deps, permissionChecker, adminGuard, deletionCodes }).router);
  app.use(errorHandler);
  return app;
};
