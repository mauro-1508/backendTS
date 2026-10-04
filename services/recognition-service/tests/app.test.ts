import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { InMemoryEventBus, makeAuthMiddleware, makeJwtTokenProvider, requireRole } from '@traduce/shared';
import { makeRecognitionApp } from '../src/app';
import { InMemorySampleRepository } from '../src/samples/adapters/outbound/memory/in_memory_sample_repository';

const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-recognition', expiresIn: '1h' });
const STATIC_FRAME = Array.from({ length: 63 }, (_, i) => i / 100);

const validSample = (signCode = 'HOLA') => ({
  signCode,
  captureSessionId: 'sesion-1',
  performedBy: 'Ana Perez',
  consentGrantedAt: '2026-01-01T10:00:00.000Z',
  consentTermsVersion: 'v1',
  frames: [STATIC_FRAME],
});

describe('recognition-service HTTP (sin base de datos)', () => {
  let server: Server;
  let base: string;

  before(async () => {
    // Las rutas probadas se cortan antes de tocar Postgres: el pool nunca se usa.
    const app = makeRecognitionApp({
      pool: {} as Pool,
      eventPublisher: new InMemoryEventBus(),
      sampleRepository: new InMemorySampleRepository(),
      authMiddleware: makeAuthMiddleware(tokenProvider),
      requireAdmin: requireRole('ADMIN'),
    });
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>(resolve => server.close(() => resolve())));

  const bearer = (roles: string[]) => ({
    authorization: `Bearer ${tokenProvider.sign({ userId: 9, email: 'a@b.c', roles })}`,
    'content-type': 'application/json',
  });
  const postSample = (body: unknown, roles = ['ADMIN']) =>
    fetch(`${base}/api/samples`, { method: 'POST', headers: bearer(roles), body: JSON.stringify(body) });

  test('GET /health responde ok', async () => {
    const response = await fetch(`${base}/health`);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'recognition-service' });
  });

  test('traducciones sin token: 401', async () => {
    const response = await fetch(`${base}/api/translations/history`);
    assert.equal(response.status, 401);
  });

  test('crear plantilla exige token en las dos rutas montadas', async () => {
    for (const route of ['/api/sign-templates', '/api/recognition/sign-templates']) {
      const response = await fetch(`${base}${route}`, { method: 'POST' });
      assert.equal(response.status, 401, route);
    }
  });

  test('samples sin rol ADMIN: 403 FORBIDDEN', async () => {
    const response = await postSample(validSample(), ['USER']);
    assert.equal(response.status, 403);
    assert.equal(((await response.json()) as { code: string }).code, 'FORBIDDEN');
  });

  test('ADMIN registra una muestra y la lista filtrando por signCode', async () => {
    const created = await postSample(validSample('GRACIAS'));
    assert.equal(created.status, 201);
    const { data } = (await created.json()) as { data: { sampleId: string; recordedBy: number; isValidated: boolean } };
    assert.equal(data.recordedBy, 9);
    assert.equal(data.isValidated, false);

    await postSample(validSample('ADIOS'));
    const listed = await fetch(`${base}/api/samples?signCode=GRACIAS`, { headers: bearer(['ADMIN']) });
    const body = (await listed.json()) as { data: Array<{ sampleId: string; signCode: string }> };
    assert.equal(listed.status, 200);
    assert.deepEqual(body.data.map(s => s.sampleId), [data.sampleId]);
  });

  test('muestra sin consentimiento: 400 VALIDATION_ERROR', async () => {
    const { consentTermsVersion: _omitted, ...withoutConsent } = validSample();
    const response = await postSample(withoutConsent);
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { code: string }).code, 'VALIDATION_ERROR');
  });

  test('muestra con frames mal formados: 400', async () => {
    const response = await postSample({ ...validSample(), frames: [[1, 2, 3]] });
    assert.equal(response.status, 400);
  });
});
