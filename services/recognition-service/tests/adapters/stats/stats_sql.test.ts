import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { makePostgresTranslationStatsRepository } from '../../../src/translations/adapters/outbound/postgres/translation_stats_repository';

describe('SQL de estadisticas de traducciones', () => {
  test('todas las consultas excluyen las borradas y agrupan en hora de Bogota', async () => {
    const query = mock.fn(async (_sql: string, _params: unknown[]) => ({ rows: [{ total: 0, active: 0 }] }));
    const repository = makePostgresTranslationStatsRepository({ query } as unknown as Pool);

    await repository.getStats({
      dailyFrom: '2026-09-29', weeklyFrom: '2026-09-14', monthlyFrom: '2025-11-01', activeSince: new Date(),
    });

    assert.equal(query.mock.callCount(), 4);
    for (const call of query.mock.calls) {
      assert.ok(call.arguments[0].includes('is_deleted = FALSE'));
    }
    assert.ok(query.mock.calls.slice(1).every((call) => call.arguments[0].includes('America/Bogota')));
  });
});
