import { describe, expect, it } from 'vitest';
import { makeGetMyTranslationStats } from '../../../src/domains/translations/application/get_my_translation_stats';
import { MyStatsRaw } from '../../../src/domains/translations/domain/my_stats';

const run = (days: string[], extra: Partial<MyStatsRaw> = {}) =>
  makeGetMyTranslationStats({
    myStatsRepository: { getMyStats: async () => ({ totalTranslations: days.length, distinctWords: 2, days, ...extra }) },
  })({ userId: 1 });

describe('get_my_translation_stats', () => {
  it('sin traducciones todo es 0', async () => {
    expect(await run([], { totalTranslations: 0, distinctWords: 0 })).toEqual({
      totalTranslations: 0, distinctWords: 0, activeDays: 0,
    });
  });
  it('cuenta los dias activos distintos', async () => {
    const r = await run(['2026-09-01', '2026-10-04', '2026-10-05']);
    expect(r.activeDays).toBe(3);
  });
  it('dias duplicados no distorsionan', async () => {
    const r = await run(['2026-10-05', '2026-10-04', '2026-10-05']);
    expect(r.activeDays).toBe(2);
  });
  it('pasa totales y palabras tal cual del repositorio', async () => {
    const r = await run(['2026-10-05'], { totalTranslations: 9, distinctWords: 4 });
    expect([r.totalTranslations, r.distinctWords]).toEqual([9, 4]);
  });
});
