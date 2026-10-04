import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { makeAuthMiddleware, makeJwtTokenProvider } from '@traduce/shared';
import { makeIamApp } from '../src/app';
import {
  FakeRoleRepository, FakeUserRepository, RecordingEventPublisher, fakePasswordHasher,
} from './helpers/fakes';

const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-iam', expiresIn: '1h' });
const JSON_HEADERS = { 'content-type': 'application/json' };

describe('iam-service HTTP (con repositorios falsos)', () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = makeIamApp({
      userRepository: new FakeUserRepository(),
      roleRepository: new FakeRoleRepository(),
      authRepository: {} as never,
      mailer: { sendMail: async () => undefined },
      passwordHasher: fakePasswordHasher,
      tokenProvider,
      eventPublisher: new RecordingEventPublisher(),
      authMiddleware: makeAuthMiddleware(tokenProvider),
    });
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>(resolve => server.close(() => resolve())));

  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });

  test('GET /health responde ok', async () => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'iam-service' });
  });

  test('registro, login y /api/users/me de punta a punta', async () => {
    const credentials = { name: 'Ada', email: 'ada@example.com', password: 'clave-segura' };

    assert.equal((await post('/api/auth/register', credentials)).status, 201);
    const login = await post('/api/auth/login', credentials);
    assert.equal(login.status, 200);
    const { token } = ((await login.json()) as { data: { token: string } }).data;

    const me = await fetch(`${base}/api/users/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    assert.deepEqual(((await me.json()) as { data: unknown }).data, {
      user_id: 1, name: 'Ada', email: 'ada@example.com',
    });
  });

  test('login con credenciales inválidas responde 400 con mensaje', async () => {
    const response = await post('/api/auth/login', { email: 'x@y.z', password: 'nada' });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { success: false, message: 'Credenciales inválidas' });
  });

  test('GET /api/users/me sin token responde 401', async () => {
    assert.equal((await fetch(`${base}/api/users/me`)).status, 401);
  });
});
