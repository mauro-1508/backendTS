import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { roleParamsSchema, userParamsSchema, userRoleParamsSchema } from '../../../src/iam/adapters/inbound/http/dto/iam_request';

describe('esquemas zod de iam', () => {
  test('acepta ids validos y coacciona strings numericos', () => {
    assert.deepEqual(userParamsSchema.parse({ userId: '7' }), { userId: 7 });
    assert.equal(userParamsSchema.parse({ userId: '2147483647' }).userId, 2147483647);
  });

  for (const value of ['-1', '0', 'abc', '1.5', '2147483648']) {
    test(`rechaza id ${value}`, () => {
      assert.equal(userParamsSchema.safeParse({ userId: value }).success, false);
      assert.equal(roleParamsSchema.safeParse({ roleId: value }).success, false);
      assert.equal(userRoleParamsSchema.safeParse({ userId: value, roleName: 'ADMIN' }).success, false);
    });
  }
});
