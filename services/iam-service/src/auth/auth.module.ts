import { TokenProvider } from '@traduce/shared';
import { UserRepository } from '../users/ports/outbound/user_repository';
import { AuthRepository } from './ports/outbound/auth_repository';
import { Mailer } from './ports/outbound/mailer';
import { PasswordHasher } from './ports/outbound/auth_provider';
import { makeRegister } from './application/register';
import { makeLogin } from './application/login';
import { makeForgotPassword } from './application/forgot_password';
import { makeVerifyCode } from './application/verify_code';
import { makeResetPassword } from './application/reset_password';
import { makeGoogleLogin } from './application/google_login';
import { makeAuthRoutes } from './adapters/inbound/http/routes';
import { AuthService } from './ports/inbound/auth_service';

export interface AuthModuleDeps {
  userRepository: UserRepository;
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
  tokenProvider: TokenProvider;
  mailer: Mailer;
}

// Composicion del dominio auth: recibe los adaptadores ya construidos.
export const makeAuthModule = (deps: AuthModuleDeps) => {
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
