import { RequestHandler } from 'express';
import { postgresUserRepository } from './adapters/outbound/postgres/user_repository';
import { makeGetUser } from './application/get_user';
import { makeUserRoutes } from './adapters/inbound/http/routes';
import { UserService } from './ports/inbound/user_service';

export const makeUsersModule = (deps: { authMiddleware: RequestHandler }) => {
  const userService: UserService = {
    getById: makeGetUser({ userRepository: postgresUserRepository }),
  };

  return { userService, router: makeUserRoutes({ userService, authMiddleware: deps.authMiddleware }) };
};
