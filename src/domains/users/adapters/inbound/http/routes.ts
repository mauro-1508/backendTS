import { RequestHandler, Router } from 'express';
import { UserService } from '../../../ports/inbound/user_service';
import { makeUserController } from './user_controller';

export const makeUserRoutes = (deps: { userService: UserService; authMiddleware: RequestHandler }) => {
  const router = Router();
  const userController = makeUserController(deps.userService);

  router.use(deps.authMiddleware);
  router.get('/me', userController.me);

  return router;
};
