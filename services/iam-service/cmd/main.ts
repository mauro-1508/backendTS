import 'dotenv/config';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeJwtTokenProvider, makePgPool,
} from '@traduce/shared';
import { makeIamApp } from '../src/app';
import { loadFacebookCredentials, loadGoogleClientIds, loadMailerConfig } from '../src/config';
import { makePostgresAuthRepository } from '../src/auth/adapters/outbound/postgres/auth_repository';
import { bcryptPasswordHasher } from '../src/auth/adapters/outbound/security/password';
import { makeNodemailerMailer, missingMailerSettings } from '../src/auth/adapters/outbound/mailer/mailer';
import { makeGoogleTokenVerifier } from '../src/auth/adapters/outbound/google/google_token_verifier';
import { makeFacebookTokenVerifier } from '../src/auth/adapters/outbound/facebook/facebook_token_verifier';
import { makePostgresUserRepository } from '../src/users/adapters/outbound/postgres/user_repository';
import { makePostgresAccountRepository } from '../src/users/adapters/outbound/postgres/account_repository';
import { makePostgresUserStatsRepository } from '../src/users/adapters/outbound/postgres/user_stats_repository';
import { makePostgresAdminDirectoryRepository } from '../src/users/adapters/outbound/postgres/admin_directory_repository';
import { makePostgresIamRepository } from '../src/iam/adapters/outbound/postgres/iam_repository';
import { makePostgresOutboxRepository } from '../src/shared/adapters/outbound/postgres/outbox_repository';
import { makeRelayOutbox } from '../src/shared/application/relay_outbox';
import { outboxRelayMode } from '../src/shared/application/outbox_policy';
import { startOutboxRelayLoop } from '../src/shared/application/run_outbox_relay';

const IAM_DEFAULT_PORT = 3001;

const config = loadConfig({ prefix: 'IAM', defaultPort: IAM_DEFAULT_PORT });
// En produccion sin broker falla aqui, antes de aceptar trafico.
const relayMode = outboxRelayMode({ rabbitmqUrl: config.rabbitmqUrl, nodeEnv: process.env.NODE_ENV });
const pool = makePgPool(config.db);
const eventBus = createEventBus(config.rabbitmqUrl);
const tokenProvider = makeJwtTokenProvider(config.jwt);
const mailerConfig = loadMailerConfig();
const mailer = makeNodemailerMailer(mailerConfig);
const googleClientIds = loadGoogleClientIds();
const facebookCredentials = loadFacebookCredentials();

const app = makeIamApp({
  userRepository: makePostgresUserRepository(pool),
  authRepository: makePostgresAuthRepository(pool),
  accountRepository: makePostgresAccountRepository(pool),
  userStatsRepository: makePostgresUserStatsRepository(pool),
  adminDirectory: makePostgresAdminDirectoryRepository(pool),
  iamRepository: makePostgresIamRepository(pool),
  passwordHasher: bcryptPasswordHasher,
  tokenProvider,
  eventPublisher: eventBus,
  mailer,
  googleTokenVerifier: makeGoogleTokenVerifier(googleClientIds),
  facebookTokenVerifier: makeFacebookTokenVerifier(facebookCredentials),
  authMiddleware: makeAuthMiddleware(tokenProvider),
});

// Publica los eventos del outbox (iam.UserDeleted, ...) con confirmacion del broker y reintentos.
if (relayMode === 'skip') {
  console.warn('[outbox] WARN: sin RABBITMQ_URL el relay no corre; los eventos (p. ej. iam.UserDeleted) quedan pendientes en outbox_events');
}
const outboxRelay = relayMode === 'run'
  ? startOutboxRelayLoop(makeRelayOutbox({ repository: makePostgresOutboxRepository(pool), publisher: eventBus }))
  : { stop: () => undefined };

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

if (googleClientIds.length === 0) {
  console.warn('[google] falta GOOGLE_CLIENT_IDS: POST /api/auth/google respondera 503');
}
if (!facebookCredentials) {
  console.warn('[facebook] falta FACEBOOK_APP_ID o FACEBOOK_APP_SECRET: POST /api/auth/facebook respondera 503');
}

process.on('SIGTERM', () => {
  outboxRelay.stop();
  server.close();
  void eventBus.close();
  void pool.end();
});
