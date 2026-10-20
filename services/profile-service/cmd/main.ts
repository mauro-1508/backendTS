import 'dotenv/config';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeEnvReader, makeJwtTokenProvider, makePgPool,
} from '@traduce/shared';
import { makeProfileApp } from '../src/app';
import { startAdminReportsScheduler } from '../src/adapters/inbound/scheduler/admin_reports_scheduler';
import { makeStatsHttpGateway } from '../src/adapters/outbound/http/stats_http_gateway';
import { subscribeToEvents } from '../src/adapters/inbound/events/subscriptions';
import { makeProfileModule } from '../src/profile.module';

const PROFILE_DEFAULT_PORT = 3005;
const DEFAULT_RECOGNITION_URL = 'http://recognition-service:3002';
const DEFAULT_ANALYTICS_URL = 'http://analytics-service:3004';
const DEFAULT_ADMIN_REPORTS_TICK_MS = 15 * 60 * 1000;
const MIN_ADMIN_REPORTS_TICK_MS = 60 * 1000;
/** Maximo que admite setInterval (int32). */
const MAX_ADMIN_REPORTS_TICK_MS = 2_147_483_647;
const SERVICE_TOKEN_EXPIRES_IN = '5m';

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

const profileModule = makeProfileModule({
  pool,
  eventPublisher: eventBus,
  authMiddleware: makeAuthMiddleware(makeJwtTokenProvider(config.jwt)),
  statsGateway: adminReportsEnabled
    ? makeStatsHttpGateway({
      recognitionUrl: read('RECOGNITION_URL') ?? DEFAULT_RECOGNITION_URL,
      analyticsUrl: read('ANALYTICS_URL') ?? DEFAULT_ANALYTICS_URL,
      serviceTokens: makeJwtTokenProvider({ secret: config.jwt.secret, expiresIn: SERVICE_TOKEN_EXPIRES_IN }),
    })
    : undefined,
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

  process.on('SIGTERM', () => {
    server.close();
    void (async () => {
      // Espera la vuelta en curso antes de cerrar la base.
      await reportsScheduler?.stop();
      await eventBus.close();
      await pool.end();
    })();
  });
};

start().catch(error => {
  console.error('[profile] no se pudo iniciar', error);
  process.exit(1);
});
