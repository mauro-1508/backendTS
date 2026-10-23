import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import { errorHandler } from '@traduce/shared';
import { makeTranslationController } from '../src/translations/adapters/inbound/http/translation_controller';
import { makeSignTemplateController } from '../src/ia/adapters/inbound/http/sign_template_controller';
import { InvalidTranslationError, TranslationNotFoundError } from '../src/translations/domain/service';
import { InvalidSignTemplateError, SignTemplateNotFoundError } from '../src/ia/domain/service';
import { AccountErasedError } from '../src/common/domain/errors';

// Un fallo interno (p. ej. de Postgres) no debe llegar al cliente: va al errorHandler comun (500 generico).
const INTERNAL = new Error('connect ECONNREFUSED 10.0.0.5:5432 password authentication failed');

let failure: unknown = INTERNAL;
const failing = async () => { throw failure; };

describe('recognition: errores de los controladores', () => {
  let base = '';
  let server: http.Server;

  before(async () => {
    const translations = makeTranslationController({ create: failing, list: failing, remove: failing } as never);
    const templates = makeSignTemplateController({ importMany: failing, list: failing, remove: failing } as never);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { userId: 7, permissions: [] } as never; next(); });
    app.post('/t', translations.create);
    app.get('/t', translations.list);
    app.delete('/t/:id', translations.remove);
    app.post('/s', templates.import);
    app.get('/s', templates.list);
    app.delete('/s/:id', templates.remove);
    app.use(errorHandler);
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>(resolve => server.close(() => resolve())));

  const call = async (method: string, path: string, body: unknown = { outputText: 'hola', type: 'sena_texto' }) => {
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json()) as { code?: string } };
  };

  const routes: Array<[string, string]> = [
    ['POST', '/t'], ['GET', '/t'], ['DELETE', '/t/1'], ['POST', '/s'], ['GET', '/s'], ['DELETE', '/s/1'],
  ];

  for (const [method, path] of routes) {
    test(`${method} ${path}: un error desconocido responde 500 sin el detalle interno`, async () => {
      failure = INTERNAL;
      const log = mock.method(console, 'error', () => {});
      try {
        const r = await call(method, path, { templates: [] });
        assert.deepEqual(r, { status: 500, body: { success: false, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
        assert.ok(!JSON.stringify(r.body).includes('ECONNREFUSED'));
      } finally {
        log.mock.restore();
      }
    });
  }

  test('traducciones: validacion 400, no encontrada 404 y cuenta borrada 401, con su code', async () => {
    failure = new InvalidTranslationError('outputText es obligatorio');
    assert.deepEqual(await call('POST', '/t'), { status: 400, body: { success: false, code: 'VALIDATION_ERROR', message: 'outputText es obligatorio' } });
    failure = new TranslationNotFoundError('Traduccion no encontrada');
    assert.deepEqual(await call('DELETE', '/t/1'), { status: 404, body: { success: false, code: 'NOT_FOUND', message: 'Traduccion no encontrada' } });
    failure = new AccountErasedError();
    assert.equal((await call('GET', '/t')).status, 401);
  });

  test('plantillas: validacion 400 y no encontrada 404, con su code', async () => {
    failure = new InvalidSignTemplateError('label es obligatorio');
    assert.deepEqual(await call('POST', '/s', { templates: [] }), { status: 400, body: { success: false, code: 'VALIDATION_ERROR', message: 'label es obligatorio' } });
    failure = new SignTemplateNotFoundError('Plantilla no encontrada');
    assert.deepEqual(await call('DELETE', '/s/1'), { status: 404, body: { success: false, code: 'NOT_FOUND', message: 'Plantilla no encontrada' } });
  });

  test('mode o sessionId invalidos son errores de validacion (400), no internos', async () => {
    failure = INTERNAL;
    const r = await call('POST', '/t', { outputText: 'hola', type: 'sena_texto', mode: 'otro' });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'VALIDATION_ERROR');
    const s = await call('POST', '/t', { outputText: 'hola', type: 'sena_texto', sessionId: 'corto' });
    assert.equal(s.status, 400);
  });
});
