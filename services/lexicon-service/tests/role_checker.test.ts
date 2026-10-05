import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadServiceConfig } from '../src/shared/config/env';
import { jwtRoleChecker } from '../src/shared/security/jwt_role_checker';
import { makeJwtTokenVerifier } from '../src/shared/security/jwt_token_verifier';
import { makeRoleChecker } from '../src/shared/security/make_role_checker';
import { noRolesChecker, NO_ROLE_SOURCE_MESSAGE } from '../src/shared/security/no_roles_checker';
import { signTestToken, TEST_JWT_SECRET } from './helpers/tokens';

const admin = { userId: 1, email: 'a@b.c', roles: ['ADMIN'] };
const plainUser = { userId: 2, email: 'u@b.c', roles: [] };

describe('RoleChecker', () => {
  test('jwt: permite si el token trae el rol', async () => {
    assert.deepEqual(await jwtRoleChecker.check(admin, 'ADMIN'), { allowed: true });
  });

  test('jwt: deniega si el token no trae el rol', async () => {
    assert.equal((await jwtRoleChecker.check(plainUser, 'ADMIN')).allowed, false);
  });

  test('none: deniega siempre y explica por qué', async () => {
    const decision = await noRolesChecker.check(admin, 'ADMIN');
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, NO_ROLE_SOURCE_MESSAGE);
  });

  test('makeRoleChecker elige el adaptador según la fuente', () => {
    assert.equal(makeRoleChecker('jwt'), jwtRoleChecker);
    assert.equal(makeRoleChecker('none'), noRolesChecker);
  });
});

describe('verificación JWT', () => {
  const verifier = makeJwtTokenVerifier(TEST_JWT_SECRET);

  test('acepta el payload actual de iam { user_id, email } sin roles', () => {
    const user = verifier.verify(signTestToken({ user_id: 7, email: 'a@b.c' }));
    assert.deepEqual(user, { userId: 7, email: 'a@b.c', roles: [] });
  });

  test('acepta { sub, email, roles }', () => {
    const user = verifier.verify(signTestToken({ sub: '9', email: 'a@b.c', roles: ['ADMIN'] }));
    assert.deepEqual(user, { userId: 9, email: 'a@b.c', roles: ['ADMIN'] });
  });

  test('rechaza un token sin identificador de usuario', () => {
    assert.throws(() => verifier.verify(signTestToken({ email: 'a@b.c' })));
  });
});

describe('loadServiceConfig', () => {
  const baseEnv = { JWT_SECRET: TEST_JWT_SECRET };

  test('ROLE_SOURCE por defecto es none', () => {
    assert.equal(loadServiceConfig(baseEnv).roleSource, 'none');
  });

  test('acepta ROLE_SOURCE=jwt', () => {
    assert.equal(loadServiceConfig({ ...baseEnv, ROLE_SOURCE: 'jwt' }).roleSource, 'jwt');
  });

  test('rechaza un ROLE_SOURCE desconocido', () => {
    assert.throws(() => loadServiceConfig({ ...baseEnv, ROLE_SOURCE: 'db' }), /ROLE_SOURCE/);
  });

  test('JWT_SECRET es obligatorio y de al menos 32 caracteres', () => {
    assert.throws(() => loadServiceConfig({}), /JWT_SECRET/);
    assert.throws(() => loadServiceConfig({ JWT_SECRET: 'corto' }), /JWT_SECRET/);
  });
});
