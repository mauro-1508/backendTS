import { RequestHandler, Router } from 'express';
import { PERMISSIONS, requirePermission } from '@traduce/shared';
import { SignTemplateService } from '../../../ports/inbound/sign_template_service';
import { makeSignTemplateController } from './sign_template_controller';

export const MODELS_MANAGE = PERMISSIONS.MODELS_MANAGE;

export const makeSignTemplateRoutes = (deps: {
  signTemplateService: SignTemplateService;
  authMiddleware: RequestHandler;
}) => {
  const router = Router();
  const controller = makeSignTemplateController(deps.signTemplateService);

  // Listar es publico: la pantalla de traduccion baja las plantillas al abrir,
  // aunque todavia no haya sesion. Crear y borrar exigen JWT y el permiso models.manage.
  router.get('/', controller.list);
  router.post('/', deps.authMiddleware, requirePermission(MODELS_MANAGE), controller.import);
  router.delete('/:id', deps.authMiddleware, requirePermission(MODELS_MANAGE), controller.remove);

  return router;
};
