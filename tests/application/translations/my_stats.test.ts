import { describe, expect, it } from 'vitest';
import { makeGetMyTranslationStats } from '../../../src/domains/translations/application/get_my_translation_stats';
import { MyStatsRaw } from '../../../src/domains/translations/domain/my_stats';

// 2026-10-05 10:00 en Bogota = 15:00 UTC.
const NOW = new Date('2026-10-05T15:00:00Z');
const run = (days: string[], now = NOW, extra: Partial<MyStatsRaw> = {}) =>
  makeGetMyTranslationStats({
    myStatsRepository: { getMyStats: async () => ({ totalTranslations: days.length, distinctWords: 2, days, ...extra }) },
    now: () => now,
  })({ userId: 1 });

describe('get_my_translation_stats', () => {
  it('sin traducciones todo es 0', async () => {
    expect(await run([], NOW, { totalTranslations: 0, distinctWords: 0 })).toEqual({
      totalTranslations: 0, distinctWords: 0, activeDays: 0, currentStreakDays: 0, longestStreakDays: 0,
    });
  });
  it('racha viva si tradujo hoy', async () => {
    const r = await run(['2026-10-03', '2026-10-04', '2026-10-05']);
    expect([r.currentStreakDays, r.longestStreakDays, r.activeDays]).toEqual([3, 3, 3]);
  });
  it('racha de ayer sigue viva si hoy aun no tradujo', async () => {
    const r = await run(['2026-10-03', '2026-10-04']);
    expect(r.currentStreakDays).toBe(2);
  });
  it('racha rota si el ultimo dia es anteayer', async () => {
    const r = await run(['2026-10-02', '2026-10-03']);
    expect([r.currentStreakDays, r.longestStreakDays]).toEqual([0, 2]);
  });
  it('huecos: la actual cuenta solo el tramo final, la maxima el mayor historico', async () => {
    const r = await run(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-04', '2026-10-05', '2026-09-10']);
    expect([r.currentStreakDays, r.longestStreakDays, r.activeDays]).toEqual([2, 4, 7]);
  });
  it('dias duplicados o desordenados no distorsionan', async () => {
    const r = await run(['2026-10-05', '2026-10-04', '2026-10-05']);
    expect([r.activeDays, r.currentStreakDays]).toEqual([2, 2]);
  });
  it('zona Bogota: 02:00 UTC del 6 aun es 5 de octubre', async () => {
    const early = new Date('2026-10-06T02:00:00Z'); // Bogota: 5 oct 21:00
    expect((await run(['2026-10-04', '2026-10-05'], early)).currentStreakDays).toBe(2);
    const later = new Date('2026-10-06T06:00:00Z'); // Bogota: 6 oct -> el 5 es ayer
    expect((await run(['2026-10-04', '2026-10-05'], later)).currentStreakDays).toBe(2);
    const muchoDespues = new Date('2026-10-07T06:00:00Z'); // Bogota: 7 oct -> rota
    expect((await run(['2026-10-04', '2026-10-05'], muchoDespues)).currentStreakDays).toBe(0);
  });
  it('cruza el cambio de mes', async () => {
    const r = await run(['2026-09-30', '2026-10-01']);
    expect(r.longestStreakDays).toBe(2);
  });
  it('pasa totales y palabras tal cual del repositorio', async () => {
    const r = await run(['2026-10-05'], NOW, { totalTranslations: 9, distinctWords: 4 });
    expect([r.totalTranslations, r.distinctWords]).toEqual([9, 4]);
  });
});
