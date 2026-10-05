import { RequestHandler, Router } from 'express';
import { IamService } from '../../../ports/inbound/iam_service';
import { makeIamController } from './iam_controller';

export const makeIamRoutes = (deps: { iamService: IamService; authMiddleware: RequestHandler }) => {
  const router = Router();
  const iamController = makeIamController(deps.iamService);

  router.use(deps.authMiddleware);
  router.get('/me/access', iamController.myAccess);
  router.get('/roles', iamController.listRoles);
  router.post('/users/:userId/roles', iamController.assignRole);
  router.delete('/users/:userId/roles/:roleName', iamController.revokeRole);
  router.delete('/roles/:roleId', iamController.deleteRole);

  return router;
};
