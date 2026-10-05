import { describe, expect, it, vi } from 'vitest';
import { makeGetUserStats } from '../../../src/domains/users/application/get_user_stats';
import { PermissionDeniedError } from '../../../src/domains/users/domain/stats';

describe('get_user_stats', () => {
  it('sin permiso no consulta el repositorio', async () => {
    const getStats = vi.fn();
    const checker = { hasPermission: vi.fn().mockResolvedValue(false) };
    await expect(
      makeGetUserStats({ statsRepository: { getStats }, permissionChecker: checker })({ userId: 4 }),
    ).rejects.toThrow(PermissionDeniedError);
    expect(checker.hasPermission).toHaveBeenCalledWith(4, 'stats.read');
    expect(getStats).not.toHaveBeenCalled();
  });

  it('con permiso devuelve los totales', async () => {
    const getStats = vi.fn().mockResolvedValue({ totalUsers: 3, activeAccounts: 2 });
    const r = await makeGetUserStats({
      statsRepository: { getStats },
      permissionChecker: { hasPermission: async () => true },
    })({ userId: 1 });
    expect(r).toEqual({ totalUsers: 3, activeAccounts: 2 });
  });
});
