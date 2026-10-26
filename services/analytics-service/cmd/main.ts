import 'dotenv/config';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeConsumerRetryCheck, makeDeadLetterCheck, makeJwtTokenProvider, makePgPool,
  makeRetryMonitor, requireRole,
} from '@traduce/shared';
import { makeAnalyticsApp } from '../src/app';
import { makePostgresUsageEventRepository } from '../src/adapters/outbound/postgres/usage_event_repository';
import { subscribeToDomainEvents } from '../src/adapters/inbound/events/subscriptions';

const ANALYTICS_DEFAULT_PORT = 3004;
const ADMIN_ROLE = 'ADMIN';

const config = loadConfig({ prefix: 'ANALYTICS', defaultPort: ANALYTICS_DEFAULT_PORT });
const pool = makePgPool(config.db);
const eventBus = createEventBus(config.rabbitmqUrl);
const repository = makePostgresUsageEventRepository(pool);
const tokenProvider = makeJwtTokenProvider(config.jwt);
const retryMonitor = makeRetryMonitor();

const app = makeAnalyticsApp({
  repository,
  authMiddleware: makeAuthMiddleware(tokenProvider),
  requireAdmin: requireRole(ADMIN_ROLE),
}, { dead_letters: makeDeadLetterCheck(eventBus), consumer_retrying: makeConsumerRetryCheck(retryMonitor) });

const server = app.listen(config.port, () => {
  console.log(`analytics-service escuchando en el puerto ${config.port}`);
});

// El broker puede no estar arriba aun: subscribeWithRetry reintenta sin bloquear el servicio HTTP.
void subscribeToDomainEvents({ subscriber: eventBus, repository, retryMonitor });

process.on('SIGTERM', () => {
  server.close();
  void eventBus.close();
  void pool.end();
});
