import 'dotenv/config';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeJwtTokenProvider, makePgPool,
} from '@traduce/shared';
import { makeIamApp } from '../src/app';
import { loadMailerConfig } from '../src/config';
import { makePostgresAuthRepository } from '../src/auth/adapters/outbound/postgres/auth_repository';
import { bcryptPasswordHasher } from '../src/auth/adapters/outbound/security/password';
import { makeNodemailerMailer } from '../src/auth/adapters/outbound/mailer/mailer';
import { makePostgresUserRepository } from '../src/users/adapters/outbound/postgres/user_repository';

const IAM_DEFAULT_PORT = 3001;

const config = loadConfig({ prefix: 'IAM', defaultPort: IAM_DEFAULT_PORT });
const pool = makePgPool(config.db);
const eventBus = createEventBus(config.rabbitmqUrl);
const tokenProvider = makeJwtTokenProvider(config.jwt);

const app = makeIamApp({
  userRepository: makePostgresUserRepository(pool),
  authRepository: makePostgresAuthRepository(pool),
  passwordHasher: bcryptPasswordHasher,
  tokenProvider,
  mailer: makeNodemailerMailer(loadMailerConfig()),
  authMiddleware: makeAuthMiddleware(tokenProvider),
});

const server = app.listen(config.port, () => {
  console.log(`iam-service escuchando en el puerto ${config.port}`);
});

process.on('SIGTERM', () => {
  server.close();
  void eventBus.close();
  void pool.end();
});
