import { describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../src/shared/database/postgres', () => ({ pool: { query } }));

import { postgresTranslationStatsRepository } from '../../../src/domains/translations/adapters/outbound/postgres/translation_stats_repository';

describe('SQL de estadisticas de traducciones', () => {
  it('todas las consultas excluyen las borradas y agrupan en hora de Bogota', async () => {
    query.mockResolvedValue({ rows: [{ total: 0, active: 0 }] });
    await postgresTranslationStatsRepository.getStats({
      dailyFrom: '2026-09-29', weeklyFrom: '2026-09-14', monthlyFrom: '2025-11-01', activeSince: new Date(),
    });
    expect(query).toHaveBeenCalledTimes(4);
    for (const [sql] of query.mock.calls) {
      expect(sql).toContain('is_deleted = FALSE');
    }
    expect(query.mock.calls.slice(1).every(([sql]) => (sql as string).includes('America/Bogota'))).toBe(true);
  });
});
