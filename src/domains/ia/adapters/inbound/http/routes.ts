import { RequestHandler, Router } from 'express';
import { SignTemplateService } from '../../../ports/inbound/sign_template_service';
import { makeSignTemplateController } from './sign_template_controller';

export const makeSignTemplateRoutes = (deps: {
  signTemplateService: SignTemplateService;
  authMiddleware: RequestHandler;
}) => {
  const router = Router();
  const controller = makeSignTemplateController(deps.signTemplateService);

  // Listar es publico: la pantalla de traduccion baja las plantillas al abrir,
  // aunque todavia no haya sesion. Crear y borrar exigen JWT.
  router.get('/', controller.list);
  router.post('/', deps.authMiddleware, controller.import);
  router.delete('/:id', deps.authMiddleware, controller.remove);

  return router;
};
