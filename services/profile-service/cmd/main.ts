import 'dotenv/config';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeJwtTokenProvider, makePgPool,
} from '@traduce/shared';
import { makeProfileApp } from '../src/app';
import { subscribeToEvents } from '../src/adapters/inbound/events/subscriptions';
import { makeProfileModule } from '../src/profile.module';

const PROFILE_DEFAULT_PORT = 3005;

const config = loadConfig({ prefix: 'PROFILE', defaultPort: PROFILE_DEFAULT_PORT });
const pool = makePgPool(config.db);
const eventBus = createEventBus(config.rabbitmqUrl);

const profileModule = makeProfileModule({
  pool,
  eventPublisher: eventBus,
  authMiddleware: makeAuthMiddleware(makeJwtTokenProvider(config.jwt)),
});

const start = async () => {
  await subscribeToEvents(eventBus, profileModule.eventHandlers);
  const server = makeProfileApp(profileModule).listen(config.port, () => {
    console.log(`profile-service escuchando en el puerto ${config.port}`);
  });

  process.on('SIGTERM', () => {
    server.close();
    void eventBus.close();
    void pool.end();
  });
};

start().catch(error => {
  console.error('[profile] no se pudo iniciar', error);
  process.exit(1);
});
