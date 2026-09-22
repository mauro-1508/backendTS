import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { config } from '../../config/config';
import { pool } from '../../internal/adapters/outbound/postgres/postgres';
import { postgresUserRepository } from '../../internal/adapters/outbound/postgres/user_repository';
import { postgresAuthRepository } from '../../internal/adapters/outbound/postgres/auth_repository';
import { postgresTranslationRepository } from '../../internal/adapters/outbound/postgres/translation_repository';
import { jwtTokenProvider } from '../../internal/adapters/outbound/security/jwt';
import { bcryptPasswordHasher } from '../../internal/adapters/outbound/security/password';
import { nodemailerMailer } from '../../internal/adapters/outbound/mailer/mailer';
import { makeRegister } from '../../internal/application/auth/register';
import { makeLogin } from '../../internal/application/auth/login';
import { makeForgotPassword } from '../../internal/application/auth/forgot_password';
import { makeVerifyCode } from '../../internal/application/auth/verify_code';
import { makeResetPassword } from '../../internal/application/auth/reset_password';
import { makeGoogleLogin } from '../../internal/application/auth/google_login';
import { makeGetUser } from '../../internal/application/user/get_user';
import { makeCreateTranslation } from '../../internal/application/translation/create_translation';
import { makeListTranslations } from '../../internal/application/translation/list_translations';
import { makeDeleteTranslation } from '../../internal/application/translation/delete_translation';
import { makeRoutes } from '../../internal/adapters/inbound/http/routes/routes';
import { AuthService } from '../../internal/ports/inbound/auth_service';
import { TranslationService } from '../../internal/ports/inbound/translation_service';
import { UserService } from '../../internal/ports/inbound/user_service';

// Composicion de dependencias (puertos -> adaptadores concretos).
const authDeps = {
  userRepository: postgresUserRepository,
  authRepository: postgresAuthRepository,
  passwordHasher: bcryptPasswordHasher,
  tokenProvider: jwtTokenProvider,
  mailer: nodemailerMailer,
};

const authService: AuthService = {
  register: makeRegister(authDeps),
  login: makeLogin(authDeps),
  forgotPassword: makeForgotPassword(authDeps),
  verifyCode: makeVerifyCode(authDeps),
  resetPassword: makeResetPassword(authDeps),
  googleLogin: makeGoogleLogin(authDeps),
};

const userService: UserService = {
  getById: makeGetUser({ userRepository: postgresUserRepository }),
};

const translationDeps = { translationRepository: postgresTranslationRepository };
const translationService: TranslationService = {
  create: makeCreateTranslation(translationDeps),
  list: makeListTranslations(translationDeps),
  remove: makeDeleteTranslation(translationDeps),
};

const app = express();

// El frontend web (Expo) corre en un puerto distinto al backend; sin CORS el
// navegador bloquea las peticiones.
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api', makeRoutes({ authService, translationService, userService, tokenProvider: jwtTokenProvider }));

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

app.listen(config.port, () => {
  console.log(`Servidor corriendo en el puerto ${config.port}`);
});

process.on('SIGTERM', () => {
  void pool.end();
});
