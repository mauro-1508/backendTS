import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { makeAuthMiddleware, makeJwtTokenProvider, requireRole } from '@traduce/shared';
import { makeAnalyticsApp } from '../src/app';
import { makeInMemoryUsageRepository } from './helpers/fakes';

const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-analytics', expiresIn: '1h' });
const tokenFor = (roles: string[]) => tokenProvider.sign({ userId: 4, email: 'a@b.co', roles });

describe('analytics-service HTTP', () => {
  let server: Server;
  let base: string;
  const repository = makeInMemoryUsageRepository();

  before(async () => {
    const app = makeAnalyticsApp({
      repository,
      authMiddleware: makeAuthMiddleware(tokenProvider),
      requireAdmin: requireRole('ADMIN'),
    });
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>(resolve => server.close(() => resolve())));

  const call = (path: string, token?: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  test('GET /health responde ok', async () => {
    assert.equal((await call('/health')).status, 200);
  });

  test('POST /events exige token y devuelve 202 con un evento valido', async () => {
    const event = { section: 'ALPHABET', eventType: 'SECTION_VIEW' };
    assert.equal((await call('/api/analytics/events', undefined, event)).status, 401);
    assert.equal((await call('/api/analytics/events', tokenFor(['USER']), event)).status, 202);
    assert.equal(repository.events.length, 1);
    assert.equal(repository.events[0].userId, '4');
  });

  test('POST /events con datos invalidos devuelve 400', async () => {
    const res = await call('/api/analytics/events', tokenFor(['USER']), { section: 'X', eventType: 'SECTION_VIEW' });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as any).code, 'VALIDATION_ERROR');
  });

  test('los reportes devuelven 403 a un usuario sin rol ADMIN', async () => {
    for (const path of ['summary', 'top-signs', 'daily']) {
      const res = await call(`/api/analytics/${path}?from=2026-10-01&to=2026-10-02`, tokenFor(['USER']));
      assert.equal(res.status, 403, path);
    }
  });

  test('un ADMIN obtiene el resumen y recibe 400 si falta el rango', async () => {
    const ok = await call('/api/analytics/summary?from=2026-01-01&to=2026-12-31', tokenFor(['ADMIN']));
    assert.equal(ok.status, 200);
    assert.deepEqual(((await ok.json()) as any).data, { translations: 0, newUsers: 0 });
    assert.equal((await call('/api/analytics/daily', tokenFor(['ADMIN']))).status, 400);
  });
});
