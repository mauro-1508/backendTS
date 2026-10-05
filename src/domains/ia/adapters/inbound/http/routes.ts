import { RequestHandler, Router } from 'express';
import { SignTemplateService } from '../../../ports/inbound/sign_template_service';
import { makeSignTemplateController } from './sign_template_controller';
import { makeRequirePermission } from './require_permission';
import { PermissionChecker } from '../../../ports/outbound/permission_checker';

export const MODELS_MANAGE = 'models.manage';

export const makeSignTemplateRoutes = (deps: {
  signTemplateService: SignTemplateService;
  authMiddleware: RequestHandler;
  permissionChecker: PermissionChecker;
}) => {
  const router = Router();
  const requirePermission = makeRequirePermission(deps.permissionChecker);
  const controller = makeSignTemplateController(deps.signTemplateService);

  // Listar es publico: la pantalla de traduccion baja las plantillas al abrir,
  // aunque todavia no haya sesion. Crear y borrar exigen JWT y el permiso models.manage.
  router.get('/', controller.list);
  router.post('/', deps.authMiddleware, requirePermission(MODELS_MANAGE), controller.import);
  router.delete('/:id', deps.authMiddleware, requirePermission(MODELS_MANAGE), controller.remove);

  return router;
};
