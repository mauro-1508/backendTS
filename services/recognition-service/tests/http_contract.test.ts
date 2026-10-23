import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import { Pool } from 'pg';
import { InMemoryEventBus, makeAuthMiddleware, makeJwtTokenProvider, requireRole } from '@traduce/shared';
import { makeTranslationsModule } from '../src/translations/translations.module';
import { makeIaModule } from '../src/ia/ia.module';
import { makeSamplesModule } from '../src/samples/samples.module';
import { InMemorySampleRepository } from '../src/samples/adapters/outbound/memory/in_memory_sample_repository';
import { TranslationRepository } from '../src/translations/ports/outbound/translation_repository';
import { Translation } from '../src/translations/domain/entity';

// Fija el JSON exacto (codigo + cuerpo) de los 8 endpoints que devuelven el sobre { success, message?, data? }.
const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-contrato-http', expiresIn: '1h' });
const AUTH = {
  authorization: `Bearer ${tokenProvider.sign({ userId: 4, email: 'a@b.c', roles: ['ADMIN'], permissions: ['models.manage'] })}`,
  'content-type': 'application/json',
};
const CREATED_AT = new Date('2026-01-02T03:04:05.000Z');
const STORED: Translation = {
  translationId: 7, userId: 4, inputText: 'HOLA', outputText: 'Hola', type: 'sena_texto',
  confidence: null, source: null, isDeleted: false, createdAt: CREATED_AT,
};
const TEMPLATE_ROW = {
  template_id: 3, label: 'hola', kind: 'static', features: [Array(63).fill(0.5)],
  source: 'manual', created_by: 4, created_at: CREATED_AT,
};
const TEMPLATE_JSON = {
  templateId: 3, label: 'hola', kind: 'static', features: [Array(63).fill(0.5)],
  source: 'manual', createdBy: 4, createdAt: CREATED_AT.toISOString(),
};

describe('contrato HTTP: sobre { success, message?, data? }', () => {
  let server: Server;
  let base: string;
  let removable = true;
  let templateExists = true;

  before(async () => {
    const translationRepository: TranslationRepository = {
      create: async input => ({ ...STORED, inputText: input.inputText, outputText: input.outputText, type: input.type }),
      listByUser: async () => [STORED],
      eraseUser: async () => 0,
      softDelete: async ({ translationId }) => (removable ? { translationId } : null),
    };
    const query = async (sql: string) => {
      if (sql.includes('erased_users') || sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.includes('pg_advisory')) return { rows: [] };
      if (sql.includes('DELETE FROM')) return { rows: templateExists ? [{ template_id: 3 }] : [] };
      return { rows: [TEMPLATE_ROW] };
    };
    const pool = { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
    const authMiddleware = makeAuthMiddleware(tokenProvider);
    const app = express();
    app.use(express.json());
    app.use('/t', makeTranslationsModule({
      pool, eventPublisher: new InMemoryEventBus(), authMiddleware, translationRepository,
    }).router);
    app.use('/s', makeIaModule({ pool, authMiddleware }).router);
    app.use('/m', makeSamplesModule({
      pool, sampleRepository: new InMemorySampleRepository(), authMiddleware, requireAdmin: requireRole('ADMIN'),
    }).router);
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>(resolve => server.close(() => resolve())));

  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(base + path, { method, headers: AUTH, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const sampleBody = {
    signCode: 'HOLA', captureSessionId: 's1', performedBy: 'Ana', consentGrantedAt: '2026-01-01T10:00:00.000Z',
    consentTermsVersion: 'v1', frames: [Array(63).fill(0.1)],
  };

  test('POST translations: 201 con message y data', async () => {
    const r = await call('POST', '/t', { inputText: 'HOLA', outputText: 'Hola', type: 'sena_texto' });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { success: true, message: 'Traduccion guardada', data: { ...STORED, createdAt: CREATED_AT.toISOString() } });
  });

  test('GET translations/history: 200 sin message', async () => {
    const r = await call('GET', '/t/history');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, data: [{ ...STORED, createdAt: CREATED_AT.toISOString() }] });
  });

  test('DELETE translations/:id: 200 y 404 NOT_FOUND si no existe', async () => {
    removable = true;
    assert.deepEqual(await call('DELETE', '/t/7'), { status: 200, body: { success: true, message: 'Traduccion eliminada', data: { translationId: 7 } } });
    removable = false;
    assert.deepEqual(await call('DELETE', '/t/7'), { status: 404, body: { success: false, code: 'NOT_FOUND', message: 'Traduccion no encontrada' } });
  });

  test('POST sign-templates: 201 con ids importados', async () => {
    const r = await call('POST', '/s', { templates: [{ label: 'hola', kind: 'static', features: [Array(63).fill(0.5)] }] });
    assert.deepEqual(r, { status: 201, body: { success: true, message: '1 plantillas importadas', data: [3] } });
  });

  test('GET sign-templates: 200 sin message', async () => {
    const r = await fetch(`${base}/s`).then(async x => ({ status: x.status, body: await x.json() }));
    assert.deepEqual(r, { status: 200, body: { success: true, data: [TEMPLATE_JSON] } });
  });

  test('DELETE sign-templates/:id: 200 y 404 NOT_FOUND si no existe', async () => {
    templateExists = true;
    assert.deepEqual(await call('DELETE', '/s/3'), { status: 200, body: { success: true, message: 'Plantilla eliminada', data: { templateId: 3 } } });
    templateExists = false;
    assert.deepEqual(await call('DELETE', '/s/3'), { status: 404, body: { success: false, code: 'NOT_FOUND', message: 'Plantilla no encontrada' } });
  });

  test('POST samples: 201 con message y data; GET samples: 200 sin message', async () => {
    const created = await call('POST', '/m', sampleBody);
    const { data } = created.body as { data: unknown };
    assert.deepEqual(created, { status: 201, body: { success: true, message: 'Muestra guardada', data } });
    assert.deepEqual(Object.keys(created.body as object), ['success', 'message', 'data']);
    // El listado devuelve la misma muestra serializada, sin depender del UUID ni la fecha.
    assert.deepEqual(await call('GET', '/m'), { status: 200, body: { success: true, data: [data] } });
  });
});
