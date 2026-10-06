import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { makeTranslationRoutes } from '../../../src/translations/adapters/inbound/http/routes';
import { makeGetMyTranslationStats } from '../../../src/translations/application/get_my_translation_stats';
import { makePostgresMyStatsRepository } from '../../../src/translations/adapters/outbound/postgres/my_stats_repository';
import { TranslationService } from '../../../src/translations/ports/inbound/translation_service';
import { authMiddleware, bearerFor, callRouter } from '../../helpers/router';

describe('GET /translations/me/stats', () => {
  const getMyRepo = mock.fn(async (_userId: number) => ({ totalTranslations: 3, distinctWords: 2, days: ['2026-10-05'] }));
  const getMyStats = makeGetMyTranslationStats({ myStatsRepository: { getMyStats: getMyRepo } });
  const router = makeTranslationRoutes({ translationService: { getMyStats } as unknown as TranslationService, authMiddleware });

  test('401 sin token', async () => {
    assert.equal((await callRouter(router, '/me/stats', {})).status, 401);
    assert.equal(getMyRepo.mock.callCount(), 0);
  });

  test('200 con la forma del contrato y usa el user_id del token (sin pedir permisos)', async () => {
    const r = await callRouter(router, '/me/stats', bearerFor([]));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      success: true,
      data: { totalTranslations: 3, distinctWords: 2, activeDays: 1 },
    });
    assert.deepEqual(getMyRepo.mock.calls[0].arguments, [7]);
  });
});

describe('SQL de /me/stats', () => {
  test('filtra por user_id, excluye borradas, normaliza palabras y agrupa en Bogota', async () => {
    const results = [{ rows: [{ total: 2, words: 1 }] }, { rows: [{ d: '2026-10-05' }] }];
    const query = mock.fn(async (_sql: string, _params: unknown[]) => results.shift());
    const repository = makePostgresMyStatsRepository({ query } as unknown as Pool);

    const r = await repository.getMyStats(42);

    assert.deepEqual(r, { totalTranslations: 2, distinctWords: 1, days: ['2026-10-05'] });
    assert.equal(query.mock.callCount(), 2);
    for (const { arguments: [sql, params] } of query.mock.calls) {
      assert.ok(sql.includes('user_id = $1'));
      assert.ok(sql.includes('is_deleted = FALSE'));
      assert.deepEqual(params, [42]);
    }
    assert.ok(query.mock.calls[0].arguments[0].includes('lower(btrim(output_text))'));
    assert.ok(query.mock.calls[1].arguments[0].includes('America/Bogota'));
  });
});
