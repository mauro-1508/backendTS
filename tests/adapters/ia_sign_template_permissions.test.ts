import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeSignTemplateRoutes } from '../../src/domains/ia/adapters/inbound/http/routes';
import { SignTemplateService } from '../../src/domains/ia/ports/inbound/sign_template_service';

// authMiddleware falso: "Bearer admin" y "Bearer user" son cuentas 1 y 2; sin cabecera, 401.
const authMiddleware: express.RequestHandler = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) { res.status(401).json({ message: 'sin token' }); return; }
  req.user = { userId: h === 'Bearer admin' ? 1 : 2, email: 'a@b.c' };
  next();
};
const permissionChecker = {
  hasPermission: vi.fn(async (userId: number, permission: string) => userId === 1 && permission === 'models.manage'),
};
const service: SignTemplateService = {
  importMany: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  list: vi.fn().mockResolvedValue({ success: true, data: [] }),
  remove: vi.fn().mockResolvedValue({ success: true }),
};

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sign-templates', makeSignTemplateRoutes({ signTemplateService: service, authMiddleware, permissionChecker }));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sign-templates`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const call = (method: string, path: string, auth?: string) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: method === 'POST' ? JSON.stringify({ templates: [{ label: 'hola', kind: 'static', features: [[0]] }] }) : undefined,
  });

describe('sign-templates exige models.manage para escribir', () => {
  it('GET es publico', async () => {
    expect((await call('GET', '/')).status).toBe(200);
  });
  it('POST/DELETE sin token: 401', async () => {
    expect((await call('POST', '/')).status).toBe(401);
    expect((await call('DELETE', '/3')).status).toBe(401);
  });
  it('POST/DELETE con USER: 403 y el servicio no se llama', async () => {
    expect((await call('POST', '/', 'Bearer user')).status).toBe(403);
    expect((await call('DELETE', '/3', 'Bearer user')).status).toBe(403);
    expect(service.importMany).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
  });
  it('POST con ADMIN: 201; DELETE con ADMIN: 200', async () => {
    expect((await call('POST', '/', 'Bearer admin')).status).toBe(201);
    expect((await call('DELETE', '/3', 'Bearer admin')).status).toBe(200);
    expect(permissionChecker.hasPermission).toHaveBeenCalledWith(1, 'models.manage');
  });
});
