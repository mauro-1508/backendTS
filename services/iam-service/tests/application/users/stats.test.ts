import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeGetUserStats } from '../../../src/users/application/get_user_stats';
import { PermissionDeniedError } from '../../../src/users/domain/stats';
import { argsOf } from '../../helpers/fakes';

describe('get_user_stats', () => {
  test('sin permiso no consulta el repositorio', async () => {
    const getStats = mock.fn(async () => ({ totalUsers: 0, activeAccounts: 0 }));
    const hasPermission = mock.fn(async (_userId: number, _permission: string) => false);
    await assert.rejects(
      makeGetUserStats({ statsRepository: { getStats }, permissionChecker: { hasPermission } })({ userId: 4 }),
      PermissionDeniedError,
    );
    assert.deepEqual(argsOf(hasPermission), [4, 'stats.read']);
    assert.equal(getStats.mock.callCount(), 0);
  });

  test('con permiso devuelve los totales', async () => {
    const getStats = mock.fn(async () => ({ totalUsers: 3, activeAccounts: 2 }));
    const r = await makeGetUserStats({
      statsRepository: { getStats },
      permissionChecker: { hasPermission: async () => true },
    })({ userId: 1 });
    assert.deepEqual(r, { totalUsers: 3, activeAccounts: 2 });
  });
});
