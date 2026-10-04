import 'dotenv/config';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeJwtTokenProvider, makePgPool, requireRole,
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

const app = makeAnalyticsApp({
  repository,
  authMiddleware: makeAuthMiddleware(tokenProvider),
  requireAdmin: requireRole(ADMIN_ROLE),
});

const server = app.listen(config.port, () => {
  console.log(`analytics-service escuchando en el puerto ${config.port}`);
});

// El broker puede no estar arriba aun: el servicio HTTP sigue sirviendo y el fallo queda en el log.
subscribeToDomainEvents({ subscriber: eventBus, repository }).catch(error => {
  console.error('[analytics] no se pudo suscribir a los eventos', error);
});

process.on('SIGTERM', () => {
  server.close();
  void eventBus.close();
  void pool.end();
});
