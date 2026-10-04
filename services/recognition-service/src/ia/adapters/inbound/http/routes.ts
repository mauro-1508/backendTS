import { RequestHandler, Router } from 'express';
import { SignTemplateService } from '../../../ports/inbound/sign_template_service';
import { makeSignTemplateController } from './sign_template_controller';

export const makeSignTemplateRoutes = (deps: {
  signTemplateService: SignTemplateService;
  authMiddleware: RequestHandler;
  /** Exige rol ADMIN; va despues de authMiddleware. */
  requireAdmin: RequestHandler;
}) => {
  const router = Router();
  const controller = makeSignTemplateController(deps.signTemplateService);

  // Listar es publico: la pantalla de traduccion baja las plantillas al abrir,
  // aunque todavia no haya sesion. Crear y borrar exigen JWT y rol ADMIN.
  router.get('/', controller.list);
  router.post('/', deps.authMiddleware, deps.requireAdmin, controller.import);
  router.delete('/:id', deps.authMiddleware, deps.requireAdmin, controller.remove);

  return router;
};
