import { Router } from 'express';
import { AuthService } from '../../../../ports/inbound/auth_service';
import { TranslationService } from '../../../../ports/inbound/translation_service';
import { UserService } from '../../../../ports/inbound/user_service';
import { TokenProvider } from '../../../../ports/outbound/auth_provider';
import { makeAuthController } from '../controllers/auth_controller';
import { makeTranslationController } from '../controllers/translation_controller';
import { makeUserController } from '../controllers/user_controller';
import { makeAuthMiddleware } from '../middleware/auth_middleware';

export const makeRoutes = (deps: {
  authService: AuthService;
  translationService: TranslationService;
  userService: UserService;
  tokenProvider: TokenProvider;
}) => {
  const router = Router();
  const authController = makeAuthController(deps.authService);
  const translationController = makeTranslationController(deps.translationService);
  const userController = makeUserController(deps.userService);
  const authMiddleware = makeAuthMiddleware(deps.tokenProvider);

  const authRouter = Router();
  authRouter.post('/register', authController.register);
  authRouter.post('/login', authController.login);
  authRouter.post('/forgot-password', authController.forgotPassword);
  authRouter.post('/verify-code', authController.verifyCode);
  authRouter.post('/reset-password', authController.resetPassword);

  const translationRouter = Router();
  // Todas las rutas de traducciones requieren JWT valido; el controller
  // resuelve el user_id desde req.user (con fallback a body/query).
  translationRouter.use(authMiddleware);
  translationRouter.post('/', translationController.create);
  translationRouter.get('/history', translationController.list);
  translationRouter.delete('/:id', translationController.remove);

  const userRouter = Router();
  userRouter.use(authMiddleware);
  userRouter.get('/me', userController.me);

  router.use('/auth', authRouter);
  router.use('/translations', translationRouter);
  router.use('/users', userRouter);

  return router;
};
