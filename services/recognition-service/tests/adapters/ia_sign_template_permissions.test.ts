import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import { makeAuthMiddleware, makeJwtTokenProvider } from '@traduce/shared';
import { makeSignTemplateRoutes } from '../../src/ia/adapters/inbound/http/routes';
import { SignTemplateService } from '../../src/ia/ports/inbound/sign_template_service';

// Tokens reales: el permiso models.manage viaja firmado en el JWT (lo concede iam al rol ADMIN).
const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-sign-templates', expiresIn: '1h' });
const tokenWith = (permissions: string[] | undefined) =>
  `Bearer ${tokenProvider.sign({ userId: 1, email: 'a@b.c', roles: ['USER'], ...(permissions ? { permissions } : {}) })}`;
const ADMIN = tokenWith(['models.manage', 'stats.read']);
const USER = tokenWith(['translation.create']);
const LEGACY = tokenWith(undefined); // token sin claim de permisos

const service: SignTemplateService = {
  importMany: mock.fn(async () => ({ success: true, message: 'ok' })),
  list: mock.fn(async () => ({ success: true, data: [] })),
  remove: mock.fn(async () => ({ success: true })),
};
const calls = (fn: unknown) => (fn as { mock: { callCount(): number } }).mock.callCount();

let server: Server;
let base: string;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sign-templates', makeSignTemplateRoutes({
    signTemplateService: service,
    authMiddleware: makeAuthMiddleware(tokenProvider),
  }));
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sign-templates`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (method: string, path: string, auth?: string) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: method === 'POST' ? JSON.stringify({ templates: [{ label: 'hola', kind: 'static', features: [[0]] }] }) : undefined,
  });

describe('sign-templates exige models.manage (permiso del JWT) para escribir', () => {
  test('GET es publico', async () => {
    assert.equal((await call('GET', '/')).status, 200);
  });

  test('POST/DELETE sin token: 401', async () => {
    assert.equal((await call('POST', '/')).status, 401);
    assert.equal((await call('DELETE', '/3')).status, 401);
  });

  test('POST/DELETE con token sin models.manage: 403 FORBIDDEN y el servicio no se llama', async () => {
    for (const token of [USER, LEGACY]) {
      const created = await call('POST', '/', token);
      assert.equal(created.status, 403);
      assert.equal(((await created.json()) as { code: string }).code, 'FORBIDDEN');
      assert.equal((await call('DELETE', '/3', token)).status, 403);
    }
    assert.equal(calls(service.importMany), 0);
    assert.equal(calls(service.remove), 0);
  });

  test('POST con models.manage: 201; DELETE con models.manage: 200', async () => {
    assert.equal((await call('POST', '/', ADMIN)).status, 201);
    assert.equal((await call('DELETE', '/3', ADMIN)).status, 200);
    assert.equal(calls(service.importMany), 1);
    assert.equal(calls(service.remove), 1);
  });
});
