import 'dotenv/config';
import { makeLexiconApp } from '../src/app';
import { loadLexiconConfig } from '../src/config';
import { loadServiceConfig } from '../src/shared/config/env';
import { makePgPool } from '../src/shared/database/pool';
import { createEventPublisher } from '../src/shared/events/create_event_publisher';
import { makeAuthMiddleware } from '../src/shared/http/auth_middleware';
import { makeRequireRole } from '../src/shared/http/require_role';
import { makeJwtTokenVerifier } from '../src/shared/security/jwt_token_verifier';
import { makeRoleChecker } from '../src/shared/security/make_role_checker';

const ADMIN_ROLE = 'ADMIN';

const config = loadServiceConfig();
const pool = makePgPool(config.db);
const eventPublisher = createEventPublisher(config.rabbitmqUrl);
const requireRole = makeRequireRole(makeRoleChecker(config.roleSource));

const app = makeLexiconApp({
  pool,
  eventPublisher,
  authMiddleware: makeAuthMiddleware(makeJwtTokenVerifier(config.jwtSecret)),
  requireAdmin: requireRole(ADMIN_ROLE),
  config: loadLexiconConfig(),
});

const server = app.listen(config.port, () => {
  console.log(`lexicon-service escuchando en el puerto ${config.port} (ROLE_SOURCE=${config.roleSource})`);
});

process.on('SIGTERM', () => {
  server.close();
  void eventPublisher.close();
  void pool.end();
});
