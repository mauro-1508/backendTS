import { RequestHandler } from 'express';
import { UserRepository } from './ports/outbound/user_repository';
import { makeGetUser } from './application/get_user';
import { makeUserRoutes } from './adapters/inbound/http/routes';
import { UserService } from './ports/inbound/user_service';

export const makeUsersModule = (deps: { userRepository: UserRepository; authMiddleware: RequestHandler }) => {
  const userService: UserService = {
    getById: makeGetUser({ userRepository: deps.userRepository }),
  };

  return { userService, router: makeUserRoutes({ userService, authMiddleware: deps.authMiddleware }) };
};
