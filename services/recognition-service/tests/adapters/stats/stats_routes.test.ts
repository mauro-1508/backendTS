import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeTranslationRoutes } from '../../../src/translations/adapters/inbound/http/routes';
import { makeGetTranslationStats } from '../../../src/translations/application/get_translation_stats';
import { TranslationService } from '../../../src/translations/ports/inbound/translation_service';
import { authMiddleware, bearerFor, callRouter } from '../../helpers/router';

const emptyRaw = { totalTranslations: 5, activeUsers30d: 2, daily: [], weekly: [], monthly: [] };
const getRepoStats = mock.fn(async () => emptyRaw);
const getStats = makeGetTranslationStats({ statsRepository: { getStats: getRepoStats } });
const router = makeTranslationRoutes({ translationService: { getStats } as unknown as TranslationService, authMiddleware });

describe('GET /translations/stats (permiso stats.read del JWT)', () => {
  test('401 sin token', async () => {
    assert.equal((await callRouter(router, '/stats', {})).status, 401);
  });

  test('403 PERMISSION_ERROR con un token sin stats.read', async () => {
    getRepoStats.mock.resetCalls();
    const r = await callRouter(router, '/stats', bearerFor(['translation.create']));
    assert.equal(r.status, 403);
    assert.deepEqual(r.body, { success: false, code: 'PERMISSION_ERROR', message: 'Permiso insuficiente' });
    assert.equal(getRepoStats.mock.callCount(), 0);
  });

  test('403 con un token sin la lista de permisos (token antiguo)', async () => {
    const r = await callRouter(router, '/stats', bearerFor([]));
    assert.equal(r.status, 403);
  });

  test('200 con la forma del contrato cuando el token trae stats.read', async () => {
    const r = await callRouter(router, '/stats', bearerFor(['stats.read'], ['ADMIN']));
    assert.equal(r.status, 200);
    const body = r.body as { success: boolean; data: Record<string, unknown[] | number> };
    assert.equal(body.success, true);
    assert.deepEqual(Object.keys(body.data).sort(), ['activeUsers30d', 'daily', 'monthly', 'totalTranslations', 'weekly']);
    assert.deepEqual([body.data.daily, body.data.weekly, body.data.monthly].map((l) => (l as unknown[]).length), [7, 4, 12]);
    assert.equal(body.data.totalTranslations, 5);
  });
});
