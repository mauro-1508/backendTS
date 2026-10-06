import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { makeAuthMiddleware, makeJwtTokenProvider } from '@traduce/shared';
import { makeIamApp } from '../src/app';
import { User } from '../src/users/domain/entity';
import { makeFakeIamRepository } from './application/iam/fake_iam_repository';
import { RecordingEventPublisher } from './helpers/fakes';

const tokenProvider = makeJwtTokenProvider({ secret: 'secreto-iam', expiresIn: '1h' });
const JSON_HEADERS = { 'content-type': 'application/json' };
const noMail = async () => undefined;

// Cuenta ACTIVE ya existente (id 10 existe en el repositorio de iam falso) con la clave "clave-segura".
const ada: User = {
  userId: 10, name: 'Ada', email: 'ada@example.com', password: 'h:clave-segura', status: 'ACTIVE',
  emailVerifiedAt: new Date(), termsAccepted: true, termsAcceptedAt: null, createdAt: new Date(),
};

describe('iam-service HTTP (con repositorios falsos)', () => {
  let server: Server;
  let base: string;
  const publisher = new RecordingEventPublisher();
  const iam = makeFakeIamRepository();
  const users: User[] = [{ ...ada }];

  before(async () => {
    await iam.repo.assignRole({ userId: 10, roleId: 2 }); // Ada es LINGUIST
    const app = makeIamApp({
      userRepository: {
        findByEmail: async (email) => users.find((u) => u.email === email) ?? null,
        findById: async (id) => users.find((u) => u.userId === id) ?? null,
        create: async ({ name, email, password, status = 'INACTIVE', emailVerifiedAt = null }) => {
          const user: User = {
            userId: 100 + users.length, name, email, password, status, emailVerifiedAt,
            termsAccepted: true, termsAcceptedAt: new Date(), createdAt: new Date(),
          };
          users.push(user);
          return user;
        },
        deleteById: async () => undefined,
        updatePassword: async () => undefined,
      },
      authRepository: { issueTokenIfAllowed: async () => 'issued' } as never,
      accountRepository: { changePassword: async () => undefined, erase: async () => 'erased' },
      userStatsRepository: { getStats: async () => ({ totalUsers: 1, activeAccounts: 1 }) },
      iamRepository: iam.repo,
      mailer: { sendVerificationCode: noMail, sendPasswordResetCode: noMail },
      passwordHasher: {
        hash: async (plain) => `h:${plain}`,
        compare: async (plain, hashed) => hashed === `h:${plain}`,
      },
      tokenProvider,
      eventPublisher: publisher,
      authMiddleware: makeAuthMiddleware(tokenProvider),
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
  const get = (path: string, token?: string) =>
    fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const loginAsAda = async () => {
    const response = await post('/api/auth/login', { email: 'ada@example.com', password: 'clave-segura' });
    return { response, body: (await response.json()) as { data: { token: string } } };
  };

  test('GET /health responde ok', async () => {
    const response = await get('/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'iam-service' });
  });

  test('login devuelve un JWT que lleva los roles y permisos de la cuenta', async () => {
    const { response, body } = await loginAsAda();
    assert.equal(response.status, 200);
    const claims = tokenProvider.verify(body.data.token);
    assert.equal(claims.userId, 10);
    assert.deepEqual(claims.roles, ['LINGUIST']);
    assert.deepEqual([...claims.permissions].sort(), ['lexicon.read', 'samples.validate', 'translation.create']);
  });

  test('GET /api/users/me con el token del login devuelve la cuenta', async () => {
    const { body } = await loginAsAda();
    const me = await get('/api/users/me', body.data.token);
    assert.equal(me.status, 200);
    assert.deepEqual(((await me.json()) as { data: unknown }).data, { user_id: 10, name: 'Ada', email: 'ada@example.com' });
  });

  test('GET /api/iam/me/access devuelve roles y permisos efectivos', async () => {
    const { body } = await loginAsAda();
    const response = await get('/api/iam/me/access', body.data.token);
    assert.equal(response.status, 200);
    const data = ((await response.json()) as { data: { roles: string[]; permissions: string[] } }).data;
    assert.deepEqual(data.roles, ['LINGUIST']);
    assert.ok(data.permissions.includes('samples.validate'));
  });

  test('registro responde 201, crea la cuenta INACTIVE y publica iam.UserRegistered', async () => {
    const before = publisher.published.length;
    const response = await post('/api/auth/register', { name: 'Bea', email: 'bea@example.com', password: 'clave-segura' });
    assert.equal(response.status, 201);
    const data = ((await response.json()) as { data: { user_id: number; status: string } }).data;
    assert.equal(data.status, 'INACTIVE');
    assert.equal(publisher.published.length, before + 1);
    assert.deepEqual(publisher.published.at(-1), {
      type: 'iam.UserRegistered',
      payload: { userId: data.user_id, email: 'bea@example.com', name: 'Bea' },
    });
  });

  test('una cuenta recien registrada no puede iniciar sesion hasta verificar el correo (403)', async () => {
    const response = await post('/api/auth/login', { email: 'bea@example.com', password: 'clave-segura' });
    assert.equal(response.status, 403);
    assert.equal(((await response.json()) as { code: string }).code, 'EMAIL_NOT_VERIFIED');
  });

  test('registro con correo repetido responde 409', async () => {
    const response = await post('/api/auth/register', { name: 'Ada', email: 'ada@example.com', password: 'clave-segura' });
    assert.equal(response.status, 409);
  });

  test('login con credenciales invalidas responde 400 INVALID_CREDENTIALS', async () => {
    const response = await post('/api/auth/login', { email: 'nadie@example.com', password: 'nada' });
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { code: string }).code, 'INVALID_CREDENTIALS');
  });

  test('login con un cuerpo mal formado responde 400 INVALID_BODY', async () => {
    const response = await post('/api/auth/login', { email: 'no-es-correo', password: 'x' });
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { code: string }).code, 'INVALID_BODY');
  });

  test('GET /api/users/me y /api/iam/me/access sin token responden 401', async () => {
    assert.equal((await get('/api/users/me')).status, 401);
    assert.equal((await get('/api/iam/me/access')).status, 401);
  });

  test('GET /api/users/stats exige stats.read en iam: LINGUIST recibe 403', async () => {
    const { body } = await loginAsAda();
    assert.equal((await get('/api/users/stats', body.data.token)).status, 403);
  });
});
