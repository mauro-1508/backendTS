import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { makeLexiconApp } from '../../services/lexicon-service/src/app';
import { InMemoryEventPublisher } from '../../services/lexicon-service/src/shared/events/in_memory_event_publisher';
import { makeAuthMiddleware } from '../../services/lexicon-service/src/shared/http/auth_middleware';
import { makeRequireRole } from '../../services/lexicon-service/src/shared/http/require_role';
import { makeJwtTokenVerifier } from '../../services/lexicon-service/src/shared/security/jwt_token_verifier';
import { makeRoleChecker } from '../../services/lexicon-service/src/shared/security/make_role_checker';

// Compatibilidad entre servicios: un token firmado por el nucleo (mismo secreto) lo entiende
// lexicon-service con ROLE_SOURCE=jwt. La base se simula vacia; solo importa la decision de rol.
const SECRET = 'secreto-compartido-nucleo-y-lexicon-32-caracteres';
let server: Server;
let base: string;
let sign: (roles: string[]) => string;

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  const { jwtTokenProvider } = await import('../../src/shared/security/jwt');
  sign = (roles) => jwtTokenProvider.sign({ userId: 5, email: 'a@b.c', roles });
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool;
  const app = makeLexiconApp({
    pool,
    eventPublisher: new InMemoryEventPublisher(),
    authMiddleware: makeAuthMiddleware(makeJwtTokenVerifier(SECRET)),
    requireAdmin: makeRequireRole(makeRoleChecker('jwt'))('ADMIN'),
    config: { mediaDir: __dirname },
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (token: string) =>
  fetch(`${base}/api/lexicon`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });

describe('lexicon-service con token del nucleo (ROLE_SOURCE=jwt)', () => {
  it('USER: 403 al escribir', async () => {
    expect((await post(sign(['USER']))).status).toBe(403);
  });

  it('ADMIN: pasa el control de rol (400 por cuerpo vacio, no 401/403)', async () => {
    expect((await post(sign(['ADMIN', 'USER']))).status).toBe(400);
  });

  it('sin token: 401', async () => {
    expect((await fetch(`${base}/api/lexicon`, { method: 'POST' })).status).toBe(401);
  });
});
