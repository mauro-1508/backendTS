import { RequestHandler, Router } from 'express';
import { TranslationService } from '../../../ports/inbound/translation_service';
import { makeTranslationController } from './translation_controller';

export const makeTranslationRoutes = (deps: {
  translationService: TranslationService;
  authMiddleware: RequestHandler;
}) => {
  const router = Router();
  const translationController = makeTranslationController(deps.translationService);

  // Todas las rutas de traducciones requieren JWT valido; el controller
  // resuelve el user_id desde req.user (con fallback a body/query).
  router.use(deps.authMiddleware);
  router.post('/', translationController.create);
  // Antes de '/:id' para que 'stats' no se tome como id.
  router.get('/stats', translationController.stats);
  router.get('/history', translationController.list);
  router.delete('/:id', translationController.remove);

  return router;
};
