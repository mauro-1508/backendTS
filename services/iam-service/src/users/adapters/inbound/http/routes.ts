import { RequestHandler, Router } from 'express';
import { PERMISSIONS, requirePermission } from '@traduce/shared';
import { UserService } from '../../../ports/inbound/user_service';
import { makeUserController } from './user_controller';

export const makeUserRoutes = (deps: { userService: UserService; authMiddleware: RequestHandler }) => {
  const router = Router();
  const userController = makeUserController(deps.userService);

  router.use(deps.authMiddleware);
  router.get('/stats', userController.stats);
  // El permiso viaja en el token de servicio de profile; ningun usuario lo tiene.
  router.get('/admins', requirePermission(PERMISSIONS.ADMIN_DIRECTORY_READ), userController.adminIds);
  router.get('/me', userController.me);
  router.delete('/me', userController.deleteAccount);
  router.post('/me/delete-code', userController.sendDeletionCode);
  router.post('/me/password', userController.changePassword);

  return router;
};
