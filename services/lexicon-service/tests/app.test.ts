import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { makeLexiconApp } from '../src/app';
import { RoleSource } from '../src/shared/config/env';
import { InMemoryEventPublisher } from '../src/shared/events/in_memory_event_publisher';
import { makeAuthMiddleware } from '../src/shared/http/auth_middleware';
import { makeRequireRole } from '../src/shared/http/require_role';
import { makeJwtTokenVerifier } from '../src/shared/security/jwt_token_verifier';
import { makeRoleChecker } from '../src/shared/security/make_role_checker';
import { signTestToken, TEST_JWT_SECRET } from './helpers/tokens';

const startApp = async (roleSource: RoleSource) => {
  // Las rutas probadas se cortan antes de tocar la base: el pool nunca se usa.
  const app = makeLexiconApp({
    pool: {} as Pool,
    eventPublisher: new InMemoryEventPublisher(),
    authMiddleware: makeAuthMiddleware(makeJwtTokenVerifier(TEST_JWT_SECRET)),
    requireAdmin: makeRequireRole(makeRoleChecker(roleSource))('ADMIN'),
    config: { mediaDir: __dirname },
  });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};

const closeServer = (server: Server) => new Promise<void>(resolve => server.close(() => resolve()));

const bearer = (claims: Record<string, unknown>) => ({ authorization: `Bearer ${signTestToken(claims)}` });

describe('lexicon-service HTTP con ROLE_SOURCE=jwt (sin base de datos)', () => {
  let server: Server;
  let base: string;
  before(async () => { ({ server, base } = await startApp('jwt')); });
  after(() => closeServer(server));

  test('GET /health responde ok', async () => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'lexicon-service' });
  });

  test('ruta de administración sin token: 401', async () => {
    const response = await fetch(`${base}/api/lexicon/admin/signs`);
    assert.equal(response.status, 401);
  });

  test('token firmado con otro secreto: 401', async () => {
    const forged = signTestToken({ user_id: 1, email: 'a@b.c', roles: ['ADMIN'] }, 'otro-secreto-distinto-de-32-caracteres!!');
    const response = await fetch(`${base}/api/lexicon/admin/signs`, { headers: { authorization: `Bearer ${forged}` } });
    assert.equal(response.status, 401);
  });

  test('token sin rol ADMIN: 403 FORBIDDEN', async () => {
    const response = await fetch(`${base}/api/lexicon/admin/signs`, { headers: bearer({ sub: '1', email: 'a@b.c', roles: ['USER'] }) });
    assert.equal(response.status, 403);
    assert.equal(((await response.json()) as { code: string }).code, 'FORBIDDEN');
  });

  test('crear una seña con token legado (user_id, sin roles): 403', async () => {
    const response = await fetch(`${base}/api/lexicon`, {
      method: 'POST',
      headers: { ...bearer({ user_id: 1, email: 'a@b.c' }), 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 403);
  });

  test('/media desconocido: 404 con code NOT_FOUND', async () => {
    const response = await fetch(`${base}/api/lexicon/media/no-existe.glb`);
    assert.equal(response.status, 404);
    assert.equal(((await response.json()) as { code: string }).code, 'NOT_FOUND');
  });
});

describe('lexicon-service HTTP con ROLE_SOURCE=none', () => {
  let server: Server;
  let base: string;
  before(async () => { ({ server, base } = await startApp('none')); });
  after(() => closeServer(server));

  test('incluso con roles ADMIN en el token se deniega con mensaje claro', async () => {
    const response = await fetch(`${base}/api/lexicon/admin/signs`, { headers: bearer({ sub: '1', email: 'a@b.c', roles: ['ADMIN'] }) });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { code: string; message: string };
    assert.equal(body.code, 'FORBIDDEN');
    assert.match(body.message, /ROLE_SOURCE/);
  });
});
