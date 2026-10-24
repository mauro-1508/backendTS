import 'dotenv/config';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeEnvReader, makeJwtTokenProvider, makePgPool,
} from '@traduce/shared';
import { makeProfileApp } from '../src/app';
import { startAdminReportsScheduler } from '../src/adapters/inbound/scheduler/admin_reports_scheduler';
import { makeIamAdminDirectory } from '../src/adapters/outbound/http/iam_admin_directory';
import { makeStatsHttpGateway } from '../src/adapters/outbound/http/stats_http_gateway';
import { makeNodemailerMailer } from '../src/adapters/outbound/mailer/nodemailer_mailer';
import { subscribeToEvents } from '../src/adapters/inbound/events/subscriptions';
import { makeProfileModule } from '../src/profile.module';

const PROFILE_DEFAULT_PORT = 3005;
const DEFAULT_RECOGNITION_URL = 'http://recognition-service:3002';
const DEFAULT_ANALYTICS_URL = 'http://analytics-service:3004';
const DEFAULT_IAM_URL = 'http://iam-service:3001';
const DEFAULT_ADMIN_REPORTS_TICK_MS = 15 * 60 * 1000;
const MIN_ADMIN_REPORTS_TICK_MS = 60 * 1000;
/** Maximo que admite setInterval (int32). */
const MAX_ADMIN_REPORTS_TICK_MS = 2_147_483_647;
const SERVICE_TOKEN_EXPIRES_IN = '5m';
const MAIL_SERVICE = 'gmail';
const DEFAULT_APP_URL = 'https://traducesenas.tech';
const DEFAULT_EMAIL_TICK_MS = 60 * 1000;

const config = loadConfig({ prefix: 'PROFILE', defaultPort: PROFILE_DEFAULT_PORT });
const pool = makePgPool(config.db);
const eventBus = createEventBus(config.rabbitmqUrl);

const read = makeEnvReader(process.env, 'PROFILE');
const adminReportsEnabled = read('ADMIN_REPORTS_ENABLED') !== 'false';
const parseTickMs = (raw: string | undefined): number => {
  const value = Number(raw);
  const valid = Number.isInteger(value) && value >= MIN_ADMIN_REPORTS_TICK_MS && value <= MAX_ADMIN_REPORTS_TICK_MS;
  return valid ? value : DEFAULT_ADMIN_REPORTS_TICK_MS;
};
const adminReportsTickMs = parseTickMs(read('ADMIN_REPORTS_TICK_MS'));

// Mismas credenciales que el correo de iam (EMAIL_USER / EMAIL_PASS). Sin ellas los EMAIL esperan PENDING.
const emailUser = read('EMAIL_USER');
const emailPass = read('EMAIL_PASS');
const appUrl = read('APP_URL') ?? DEFAULT_APP_URL;
if (!/^https?:\/\//.test(appUrl)) throw new Error('PROFILE_APP_URL debe empezar por http:// o https://');
const mailer = emailUser && emailPass
  ? makeNodemailerMailer({ service: MAIL_SERVICE, user: emailUser, pass: emailPass, appUrl })
  : undefined;

const serviceTokens = makeJwtTokenProvider({ secret: config.jwt.secret, expiresIn: SERVICE_TOKEN_EXPIRES_IN });

const profileModule = makeProfileModule({
  pool,
  eventPublisher: eventBus,
  authMiddleware: makeAuthMiddleware(makeJwtTokenProvider(config.jwt)),
  statsGateway: adminReportsEnabled
    ? makeStatsHttpGateway({
      recognitionUrl: read('RECOGNITION_URL') ?? DEFAULT_RECOGNITION_URL,
      analyticsUrl: read('ANALYTICS_URL') ?? DEFAULT_ANALYTICS_URL,
      serviceTokens,
    })
    : undefined,
  adminDirectory: adminReportsEnabled
    ? makeIamAdminDirectory({ iamUrl: read('IAM_URL') ?? DEFAULT_IAM_URL, serviceTokens })
    : undefined,
  mailer,
});

const start = async () => {
  await subscribeToEvents(eventBus, profileModule.eventHandlers);
  const server = makeProfileApp(profileModule).listen(config.port, () => {
    console.log(`profile-service escuchando en el puerto ${config.port}`);
  });

  const runAdminReports = profileModule.jobs.runAdminReports;
  const reportsScheduler = runAdminReports
    ? startAdminReportsScheduler({ run: runAdminReports, tickMs: adminReportsTickMs })
    : undefined;

  const deliverEmails = profileModule.jobs.deliverEmails;
  if (!deliverEmails) console.warn('[mailer] faltan EMAIL_USER y EMAIL_PASS: los avisos por correo quedan pendientes');
  mailer?.verify()
    .then(() => console.log('[mailer] conexion SMTP verificada'))
    .catch((error: { name?: string; code?: string }) => {
      // Solo nombre y codigo: el mensaje puede traer datos del SMTP.
      console.error('[mailer] el SMTP rechazo la conexion o las credenciales', error?.name ?? 'error', error?.code ?? '');
    });
  const emailScheduler = deliverEmails
    ? startAdminReportsScheduler({ run: deliverEmails, tickMs: DEFAULT_EMAIL_TICK_MS })
    : undefined;

  process.on('SIGTERM', () => {
    server.close();
    void (async () => {
      // Espera la vuelta en curso antes de cerrar la base.
      await reportsScheduler?.stop();
      await emailScheduler?.stop();
      await eventBus.close();
      await pool.end();
    })();
  });
};

start().catch(error => {
  console.error('[profile] no se pudo iniciar', error);
  process.exit(1);
});
