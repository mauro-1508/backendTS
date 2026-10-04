import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
// Carga la augmentación global de Express (req.user) que declara auth_middleware.
import '../../src/shared/http/auth_middleware';
import { makeRequireRole } from '../../src/shared/http/require_role';
import { RoleChecker } from '../../src/shared/security/role_checker';

const makeRes = () => {
  const res: any = { statusCode: undefined, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
};

const run = async (checker: RoleChecker, user: unknown, role = 'ADMIN') => {
  const res = makeRes();
  let nextCalls = 0;
  await makeRequireRole(checker)(role)({ user } as any, res, (() => { nextCalls++; }) as any);
  return { res, nextCalls };
};

describe('requireRole', () => {
  test('con el rol: llama a next() y no responde', async () => {
    const calls: unknown[] = [];
    const checker: RoleChecker = { hasRole: async (u, r) => { calls.push([u, r]); return true; } };
    const { res, nextCalls } = await run(checker, { userId: 5, email: 'a@b.c' });
    assert.equal(nextCalls, 1);
    assert.equal(res.statusCode, undefined);
    assert.deepEqual(calls, [[5, 'ADMIN']]);
  });

  test('sin el rol: 403 FORBIDDEN y no llama a next()', async () => {
    const { res, nextCalls } = await run({ hasRole: async () => false }, { userId: 5, email: 'a@b.c' });
    assert.equal(nextCalls, 0);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  test('sin req.user: 403 sin consultar al RoleChecker', async () => {
    let asked = false;
    const { res, nextCalls } = await run({ hasRole: async () => { asked = true; return true; } }, undefined);
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalls, 0);
    assert.equal(asked, false);
  });

  test('userId 0 se trata como usuario válido (no como ausente)', async () => {
    const { nextCalls } = await run({ hasRole: async () => true }, { userId: 0, email: 'x' });
    assert.equal(nextCalls, 1);
  });

  test('si el RoleChecker falla: 500 y no llama a next()', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const { res, nextCalls } = await run({ hasRole: async () => { throw new Error('db down'); } }, { userId: 1, email: 'x' });
      assert.equal(res.statusCode, 500);
      assert.equal(res.body.success, false);
      assert.equal(res.body.code, 'INTERNAL_ERROR');
      assert.equal(nextCalls, 0);
    } finally {
      console.error = original;
    }
  });

  test('pasa el nombre de rol pedido al checker', async () => {
    let seen = '';
    await run({ hasRole: async (_u, r) => { seen = r; return true; } }, { userId: 1, email: 'x' }, 'EDITOR');
    assert.equal(seen, 'EDITOR');
  });
});
