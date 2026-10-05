import { RequestHandler } from 'express';
import { postgresUserRepository } from './adapters/outbound/postgres/user_repository';
import { postgresAccountRepository } from './adapters/outbound/postgres/account_repository';
import { bcryptPasswordHasher } from './adapters/outbound/security/password';
import { makeGetUser } from './application/get_user';
import { makeChangePassword } from './application/change_password';
import { makeDeleteAccount } from './application/delete_account';
import { postgresUserStatsRepository } from './adapters/outbound/postgres/user_stats_repository';
import { makeGetUserStats } from './application/get_user_stats';
import { PermissionChecker } from './ports/outbound/permission_checker';
import { AdminGuard } from './ports/outbound/admin_guard';
import { makeUserRoutes } from './adapters/inbound/http/routes';
import { UserService } from './ports/inbound/user_service';

export const makeUsersModule = (deps: {
  authMiddleware: RequestHandler;
  permissionChecker: PermissionChecker;
  adminGuard: AdminGuard;
}) => {
  const accountDeps = {
    userRepository: postgresUserRepository,
    accountRepository: postgresAccountRepository,
    passwordHasher: bcryptPasswordHasher,
  };
  const userService: UserService = {
    getById: makeGetUser({ userRepository: postgresUserRepository }),
    getStats: makeGetUserStats({
      statsRepository: postgresUserStatsRepository,
      permissionChecker: deps.permissionChecker,
    }),
    changePassword: makeChangePassword(accountDeps),
    deleteAccount: makeDeleteAccount({ ...accountDeps, adminGuard: deps.adminGuard }),
  };

  return { userService, router: makeUserRoutes({ userService, authMiddleware: deps.authMiddleware }) };
};
