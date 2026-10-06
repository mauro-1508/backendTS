import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { InMemoryEventBus, makeAuthMiddleware, makeJwtTokenProvider, requireRole } from '@traduce/shared';
import { makeLexiconApp } from '../src/app';

const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-lexicon', expiresIn: '1h' });

describe('lexicon-service HTTP (sin base de datos)', () => {
  let server: Server;
  let base: string;

  before(async () => {
    // Las rutas probadas se cortan antes de tocar la base: el pool nunca se usa.
    const app = makeLexiconApp({
      pool: {} as Pool,
      eventPublisher: new InMemoryEventBus(),
      authMiddleware: makeAuthMiddleware(tokenProvider),
      requireAdmin: requireRole('ADMIN'),
      config: { mediaDir: __dirname },
    });
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>(resolve => server.close(() => resolve())));

  const bearer = (roles: string[]) => ({
    authorization: `Bearer ${tokenProvider.sign({ userId: 1, email: 'a@b.c', roles })}`,
  });

  test('GET /health responde ok', async () => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'lexicon-service' });
  });

  test('ruta de administración sin token: 401', async () => {
    const response = await fetch(`${base}/api/lexicon/admin/signs`);
    assert.equal(response.status, 401);
  });

  test('ruta de administración con token sin rol ADMIN: 403 FORBIDDEN', async () => {
    const response = await fetch(`${base}/api/lexicon/admin/signs`, { headers: bearer(['USER']) });
    assert.equal(response.status, 403);
    assert.equal(((await response.json()) as { code: string }).code, 'FORBIDDEN');
  });

  test('crear una seña con token sin rol ADMIN: 403', async () => {
    const response = await fetch(`${base}/api/lexicon`, {
      method: 'POST',
      headers: { ...bearer([]), 'content-type': 'application/json' },
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
