import { Router } from 'express';
import { AuthService } from '../../../ports/inbound/auth_service';
import { makeAuthController } from './auth_controller';

export const makeAuthRoutes = (authService: AuthService) => {
  const router = Router();
  const authController = makeAuthController(authService);

  router.post('/register', authController.register);
  router.post('/login', authController.login);
  router.post('/forgot-password', authController.forgotPassword);
  router.post('/verify-code', authController.verifyCode);
  router.post('/reset-password', authController.resetPassword);

  return router;
};
