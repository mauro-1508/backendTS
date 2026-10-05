import { RequestHandler } from 'express';
import { postgresUserRepository } from './adapters/outbound/postgres/user_repository';
import { makeGetUser } from './application/get_user';
import { postgresUserStatsRepository } from './adapters/outbound/postgres/user_stats_repository';
import { makeGetUserStats } from './application/get_user_stats';
import { PermissionChecker } from './ports/outbound/permission_checker';
import { makeUserRoutes } from './adapters/inbound/http/routes';
import { UserService } from './ports/inbound/user_service';

export const makeUsersModule = (deps: { authMiddleware: RequestHandler; permissionChecker: PermissionChecker }) => {
  const userService: UserService = {
    getById: makeGetUser({ userRepository: postgresUserRepository }),
    getStats: makeGetUserStats({
      statsRepository: postgresUserStatsRepository,
      permissionChecker: deps.permissionChecker,
    }),
  };

  return { userService, router: makeUserRoutes({ userService, authMiddleware: deps.authMiddleware }) };
};
