import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeGetMyTranslationStats } from '../../../src/translations/application/get_my_translation_stats';
import { MyStatsRaw } from '../../../src/translations/domain/my_stats';

const run = (days: string[], extra: Partial<MyStatsRaw> = {}) =>
  makeGetMyTranslationStats({
    myStatsRepository: { getMyStats: async () => ({ totalTranslations: days.length, distinctWords: 2, days, ...extra }) },
  })({ userId: 1 });

describe('get_my_translation_stats', () => {
  test('sin traducciones todo es 0', async () => {
    assert.deepEqual(await run([], { totalTranslations: 0, distinctWords: 0 }), {
      totalTranslations: 0, distinctWords: 0, activeDays: 0,
    });
  });

  test('cuenta los dias activos distintos', async () => {
    const r = await run(['2026-09-01', '2026-10-04', '2026-10-05']);
    assert.equal(r.activeDays, 3);
  });

  test('dias duplicados no distorsionan', async () => {
    const r = await run(['2026-10-05', '2026-10-04', '2026-10-05']);
    assert.equal(r.activeDays, 2);
  });

  test('pasa totales y palabras tal cual del repositorio', async () => {
    const r = await run(['2026-10-05'], { totalTranslations: 9, distinctWords: 4 });
    assert.deepEqual([r.totalTranslations, r.distinctWords], [9, 4]);
  });

  test('no expone campos de racha (no existen en este contrato)', async () => {
    const r = await run(['2026-10-05']);
    assert.deepEqual(Object.keys(r).sort(), ['activeDays', 'distinctWords', 'totalTranslations']);
  });
});
