import 'dotenv/config';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeJwtTokenProvider, makePgPool,
} from '@traduce/shared';
import { makeIamApp } from '../src/app';
import { loadMailerConfig } from '../src/config';
import { makePostgresAuthRepository } from '../src/auth/adapters/outbound/postgres/auth_repository';
import { bcryptPasswordHasher } from '../src/auth/adapters/outbound/security/password';
import { makeNodemailerMailer, missingMailerSettings } from '../src/auth/adapters/outbound/mailer/mailer';
import { makePostgresUserRepository } from '../src/users/adapters/outbound/postgres/user_repository';
import { makePostgresAccountRepository } from '../src/users/adapters/outbound/postgres/account_repository';
import { makePostgresUserStatsRepository } from '../src/users/adapters/outbound/postgres/user_stats_repository';
import { makePostgresIamRepository } from '../src/iam/adapters/outbound/postgres/iam_repository';

const IAM_DEFAULT_PORT = 3001;

const config = loadConfig({ prefix: 'IAM', defaultPort: IAM_DEFAULT_PORT });
const pool = makePgPool(config.db);
const eventBus = createEventBus(config.rabbitmqUrl);
const tokenProvider = makeJwtTokenProvider(config.jwt);
const mailerConfig = loadMailerConfig();
const mailer = makeNodemailerMailer(mailerConfig);

const app = makeIamApp({
  userRepository: makePostgresUserRepository(pool),
  authRepository: makePostgresAuthRepository(pool),
  accountRepository: makePostgresAccountRepository(pool),
  userStatsRepository: makePostgresUserStatsRepository(pool),
  iamRepository: makePostgresIamRepository(pool),
  passwordHasher: bcryptPasswordHasher,
  tokenProvider,
  eventPublisher: eventBus,
  mailer,
  authMiddleware: makeAuthMiddleware(tokenProvider),
});

const server = app.listen(config.port, () => {
  console.log(`iam-service escuchando en el puerto ${config.port}`);
});

// Los codigos se envian en segundo plano y la API responde "enviado" aunque falle: se avisa al arrancar.
const missingMail = missingMailerSettings(mailerConfig);
if (missingMail.length > 0) {
  console.warn(`[mailer] faltan ${missingMail.join(' y ')}: no se enviaran codigos de verificacion ni de recuperacion`);
} else {
  mailer.verify()
    .then(() => console.log('[mailer] conexion SMTP verificada'))
    .catch((error: unknown) => {
      // Solo nombre y codigo: error.message puede traer datos del SMTP.
      const e = error as { name?: string; code?: string } | null;
      console.error('[mailer] el SMTP rechazo la conexion o las credenciales', e?.name ?? 'error', e?.code ?? '');
    });
}

process.on('SIGTERM', () => {
  server.close();
  void eventBus.close();
  void pool.end();
});
