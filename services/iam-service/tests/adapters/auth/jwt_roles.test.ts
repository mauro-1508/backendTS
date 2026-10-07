import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { makeJwtTokenProvider } from '@traduce/shared';
import { makeLogin } from '../../../src/auth/application/login';

const SECRET = 'secreto-de-pruebas-de-iam-con-32-caracteres';
const tokenProvider = makeJwtTokenProvider({ secret: SECRET, expiresIn: '1d' });

const tokenOf = async (roles: string[], permissions: string[] = []) => {
  const login = makeLogin({
    userRepository: { findByEmail: async () => ({ userId: 9, name: 'Ana', email: 'ana@x.com', password: 'h', status: 'ACTIVE' }) } as never,
    passwordHasher: { hash: async () => 'x', compare: async () => true },
    tokenProvider,
    roleReader: { readAccess: async () => ({ roles, permissions }) },
  });
  const result = await login({ email: 'ana@x.com', password: 'clave' });
  return (result.data as { token: string }).token;
};

const decode = (token: string) => jwt.verify(token, SECRET, { audience: 'traduce-api', issuer: 'traduce-iam' }) as jwt.JwtPayload;

describe('JWT de iam con roles y permisos', () => {
  test('el token de un ADMIN lleva roles, permisos, sub y email', async () => {
    const decoded = decode(await tokenOf(['ADMIN', 'USER'], ['users.manage', 'stats.read']));
    assert.deepEqual(decoded.roles, ['ADMIN', 'USER']);
    assert.deepEqual(decoded.permissions, ['users.manage', 'stats.read']);
    assert.equal(decoded.sub, '9');
    assert.equal(decoded.email, 'ana@x.com');
  });

  test('el token de un USER lleva roles ["USER"] y solo sus permisos', async () => {
    const decoded = decode(await tokenOf(['USER'], ['translation.create']));
    assert.deepEqual(decoded.roles, ['USER']);
    assert.deepEqual(decoded.permissions, ['translation.create']);
  });

  test('caduca en 1 dia', async () => {
    const decoded = decode(await tokenOf(['USER']));
    assert.equal(decoded.exp! - decoded.iat!, 86400);
  });

  test('verify devuelve userId, email, roles y permisos (lo que ven los demas servicios)', async () => {
    const token = await tokenOf(['LINGUIST'], ['samples.validate']);
    assert.deepEqual(tokenProvider.verify(token), {
      userId: 9, email: 'ana@x.com', roles: ['LINGUIST'], permissions: ['samples.validate'],
    });
  });

  test('un token firmado con otro secreto es rechazado', () => {
    const other = makeJwtTokenProvider({ secret: 'otro-secreto-distinto-de-32-caracteres!', expiresIn: '1d' });
    const token = tokenProvider.sign({ userId: 1, email: 'a@b.co', roles: ['USER'], permissions: [] });
    assert.throws(() => other.verify(token));
  });
});
