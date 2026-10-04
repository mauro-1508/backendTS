import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { makeJwtTokenProvider } from '../src/security/jwt_token_provider';
import { makeAuthMiddleware } from '../src/http/auth_middleware';
import { requireRole } from '../src/http/require_role';
import { errorHandler } from '../src/http/error_handler';

const SECRET = 'secreto-de-prueba';
const provider = makeJwtTokenProvider({ secret: SECRET, expiresIn: '1h' });

const makeRes = () => {
  const res: any = { statusCode: undefined, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
};

describe('jwt token provider', () => {
  test('firma y verifica { sub, email, roles }', () => {
    const token = provider.sign({ userId: 7, email: 'a@b.c', roles: ['ADMIN'] });
    const payload = jwt.decode(token) as Record<string, unknown>;
    assert.equal(payload.sub, '7');
    assert.deepEqual(payload.roles, ['ADMIN']);
    assert.deepEqual(provider.verify(token), { userId: 7, email: 'a@b.c', roles: ['ADMIN'] });
  });

  test('acepta el payload viejo { user_id, email } sin roles', () => {
    const legacy = jwt.sign({ user_id: 3, email: 'v@b.c' }, SECRET);
    assert.deepEqual(provider.verify(legacy), { userId: 3, email: 'v@b.c', roles: [] });
  });

  test('rechaza un token firmado con otro secreto', () => {
    const forged = jwt.sign({ sub: '1', email: 'a@b.c' }, 'otro');
    assert.throws(() => provider.verify(forged));
  });

  test('rechaza un token sin identificador de usuario', () => {
    assert.throws(() => provider.verify(jwt.sign({ email: 'a@b.c' }, SECRET)));
  });
});

describe('authMiddleware', () => {
  const run = (authorization?: string) => {
    const req: any = { headers: { authorization } };
    const res = makeRes();
    let nextCalls = 0;
    makeAuthMiddleware(provider)(req, res, (() => { nextCalls++; }) as any);
    return { req, res, nextCalls };
  };

  test('token valido: deja el usuario en req.user y llama a next()', () => {
    const token = provider.sign({ userId: 1, email: 'a@b.c', roles: ['USER'] });
    const { req, nextCalls } = run(`Bearer ${token}`);
    assert.equal(nextCalls, 1);
    assert.deepEqual(req.user, { userId: 1, email: 'a@b.c', roles: ['USER'] });
  });

  test('sin cabecera: 401 UNAUTHORIZED', () => {
    const { res, nextCalls } = run();
    assert.equal(nextCalls, 0);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'UNAUTHORIZED');
  });

  test('token invalido: 401', () => {
    const { res, nextCalls } = run('Bearer basura');
    assert.equal(nextCalls, 0);
    assert.equal(res.statusCode, 401);
  });
});

describe('requireRole', () => {
  const run = (user: unknown, role = 'ADMIN') => {
    const res = makeRes();
    let nextCalls = 0;
    requireRole(role)({ user } as any, res, (() => { nextCalls++; }) as any);
    return { res, nextCalls };
  };

  test('el token trae el rol: llama a next()', () => {
    const { res, nextCalls } = run({ userId: 1, email: 'a@b.c', roles: ['ADMIN'] });
    assert.equal(nextCalls, 1);
    assert.equal(res.statusCode, undefined);
  });

  test('sin el rol: 403 FORBIDDEN', () => {
    const { res, nextCalls } = run({ userId: 1, email: 'a@b.c', roles: ['USER'] });
    assert.equal(nextCalls, 0);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  test('sin usuario o sin roles (token viejo): 403', () => {
    assert.equal(run(undefined).res.statusCode, 403);
    assert.equal(run({ userId: 1, email: 'a@b.c' }).res.statusCode, 403);
  });
});

describe('errorHandler', () => {
  test('responde 500 con code INTERNAL_ERROR sin filtrar el mensaje', () => {
    const original = console.error;
    console.error = () => {};
    const res = makeRes();
    try {
      errorHandler(new Error('detalle interno'), {} as any, res, (() => {}) as any);
    } finally {
      console.error = original;
    }
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(res.body), /detalle interno/);
  });
});
