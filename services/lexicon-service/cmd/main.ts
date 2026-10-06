import 'dotenv/config';
import {
  createEventBus, loadConfig, makeAuthMiddleware, makeJwtTokenProvider, makePgPool, requireRole,
} from '@traduce/shared';
import { makeLexiconApp } from '../src/app';
import { loadLexiconConfig } from '../src/config';

const LEXICON_DEFAULT_PORT = 3003;
const ADMIN_ROLE = 'ADMIN';

const config = loadConfig({ prefix: 'LEXICON', defaultPort: LEXICON_DEFAULT_PORT });
const pool = makePgPool(config.db);
const eventBus = createEventBus(config.rabbitmqUrl);
const tokenProvider = makeJwtTokenProvider(config.jwt);

const app = makeLexiconApp({
  pool,
  eventPublisher: eventBus,
  authMiddleware: makeAuthMiddleware(tokenProvider),
  requireAdmin: requireRole(ADMIN_ROLE),
  config: loadLexiconConfig(),
});

const server = app.listen(config.port, () => {
  console.log(`lexicon-service escuchando en el puerto ${config.port}`);
});

process.on('SIGTERM', () => {
  server.close();
  void eventBus.close();
  void pool.end();
});
