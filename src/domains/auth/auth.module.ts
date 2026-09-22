import { jwtTokenProvider } from '../../shared/security/jwt';
import { postgresUserRepository } from '../users/adapters/outbound/postgres/user_repository';
import { postgresAuthRepository } from './adapters/outbound/postgres/auth_repository';
import { bcryptPasswordHasher } from './adapters/outbound/security/password';
import { nodemailerMailer } from './adapters/outbound/mailer/mailer';
import { makeRegister } from './application/register';
import { makeLogin } from './application/login';
import { makeForgotPassword } from './application/forgot_password';
import { makeVerifyCode } from './application/verify_code';
import { makeResetPassword } from './application/reset_password';
import { makeGoogleLogin } from './application/google_login';
import { makeAuthRoutes } from './adapters/inbound/http/routes';
import { AuthService } from './ports/inbound/auth_service';

// Composicion de dependencias del dominio auth (puertos -> adaptadores concretos).
export const makeAuthModule = () => {
  const deps = {
    userRepository: postgresUserRepository,
    authRepository: postgresAuthRepository,
    passwordHasher: bcryptPasswordHasher,
    tokenProvider: jwtTokenProvider,
    mailer: nodemailerMailer,
  };

  const authService: AuthService = {
    register: makeRegister(deps),
    login: makeLogin(deps),
    forgotPassword: makeForgotPassword(deps),
    verifyCode: makeVerifyCode(deps),
    resetPassword: makeResetPassword(deps),
    googleLogin: makeGoogleLogin(deps),
  };

  return { authService, router: makeAuthRoutes(authService) };
};
