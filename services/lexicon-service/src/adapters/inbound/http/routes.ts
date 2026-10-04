import express, { RequestHandler, Router } from 'express';
import { LexiconService } from '../../../ports/inbound/lexicon_service';
import { makeLexiconController } from './lexicon_controller';

export const makeLexiconRoutes = (deps: {
  lexiconService: LexiconService;
  authMiddleware: RequestHandler;
  requireAdmin: RequestHandler;
  mediaDir: string;
  mediaBaseUrl?: string;
}) => {
  const router = Router();
  const controller = makeLexiconController(deps.lexiconService, { mediaBaseUrl: deps.mediaBaseUrl });

  // Modelos 3D y miniaturas del alfabeto. Un archivo no cambia sin cambiar de
  // nombre en la base, asi que se cachean una semana.
  router.use(
    '/media',
    express.static(deps.mediaDir, { maxAge: '7d' }),
    (_req, res) => { res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Recurso no encontrado' }); },
  );

  // Consultar el catalogo es publico (la pantalla del alfabeto se ve sin
  // sesion). Editarlo exige JWT y rol ADMIN (authMiddleware y luego requireAdmin).
  // Las rutas fijas van antes de /:code.
  const admin = [deps.authMiddleware, deps.requireAdmin];

  router.get('/', controller.list);
  router.get('/search', controller.search);
  router.get('/alphabet', controller.alphabet);
  router.get('/categories', controller.listCategories);
  router.post('/categories', ...admin, controller.createCategory);
  router.patch('/categories/:id', ...admin, controller.updateCategory);
  router.delete('/categories/:id', ...admin, controller.deleteCategory);
  router.get('/admin/signs', ...admin, controller.adminList);
  router.get('/admin/signs/:code', ...admin, controller.adminGet);
  router.get('/:code', controller.get);

  router.post('/', ...admin, controller.create);
  router.patch('/:code', ...admin, controller.update);
  router.delete('/:code', ...admin, controller.deactivate);
  router.post('/:code/publish', ...admin, controller.publish);
  router.put('/:code/localizations/:lang', ...admin, controller.upsertLocalization);
  router.post('/:code/resources', ...admin, controller.addResource);
  router.delete('/:code/resources/:resourceId', ...admin, controller.removeResource);

  return router;
};
