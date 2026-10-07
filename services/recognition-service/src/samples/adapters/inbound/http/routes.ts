import { RequestHandler, Router } from 'express';
import { SampleService } from '../../../ports/inbound/sample_service';
import { makeSampleController } from './sample_controller';

export const makeSampleRoutes = (deps: {
  sampleService: SampleService;
  authMiddleware: RequestHandler;
  /** Exige rol ADMIN; va despues de authMiddleware. */
  requireAdmin: RequestHandler;
}) => {
  const router = Router();
  const controller = makeSampleController(deps.sampleService);

  // Las muestras son datos biometricos: todo el recurso es solo para ADMIN.
  router.use(deps.authMiddleware, deps.requireAdmin);
  router.post('/', controller.create);
  router.get('/', controller.list);

  return router;
};
