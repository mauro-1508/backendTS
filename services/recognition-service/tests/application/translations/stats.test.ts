import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeGetTranslationStats } from '../../../src/translations/application/get_translation_stats';
import { PermissionDeniedError, StatsRaw, StatsWindow } from '../../../src/translations/domain/stats';
import { TranslationStatsRepository } from '../../../src/translations/ports/outbound/translation_stats_repository';

// 2026-10-05 es lunes; 10:00 en Bogota = 15:00 UTC.
const NOW = new Date('2026-10-05T15:00:00Z');
const empty: StatsRaw = { totalTranslations: 0, activeUsers30d: 0, daily: [], weekly: [], monthly: [] };
const repoWith = (raw: StatsRaw) => {
  const windows: StatsWindow[] = [];
  const getStats = mock.fn(async (w: StatsWindow) => { windows.push(w); return raw; });
  const repo: TranslationStatsRepository = { getStats };
  return { repo, windows, getStats };
};
const granted = ['stats.read'];

describe('get_translation_stats', () => {
  test('sin permiso stats.read lanza PermissionDeniedError y no consulta el repositorio', async () => {
    const { repo, getStats } = repoWith(empty);
    const run = makeGetTranslationStats({ statsRepository: repo, now: () => NOW });
    await assert.rejects(run({ userId: 3, permissions: [] }), PermissionDeniedError);
    await assert.rejects(run({ userId: 3, permissions: ['translation.create', 'models.manage'] }), PermissionDeniedError);
    assert.equal(getStats.mock.callCount(), 0);
  });

  test('rellena con ceros: 7 dias, 4 semanas y 12 meses en orden ascendente', async () => {
    const { repo } = repoWith(empty);
    const r = await makeGetTranslationStats({ statsRepository: repo, now: () => NOW })({ userId: 1, permissions: granted });
    assert.deepEqual(r.daily.map((d) => d.date), [
      '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    ]);
    assert.deepEqual(r.weekly.map((w) => w.weekStart), ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']);
    assert.deepEqual(r.monthly.map((m) => m.month), [
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
    for (const list of [r.daily, r.weekly, r.monthly]) assert.ok(list.every((x) => x.count === 0));
  });

  test('coloca los conteos en su posicion y deja 0 en el resto', async () => {
    const raw: StatsRaw = {
      totalTranslations: 10,
      activeUsers30d: 2,
      daily: [{ date: '2026-10-05', count: 4 }, { date: '2026-10-01', count: 1 }],
      weekly: [{ date: '2026-09-21', count: 5 }],
      monthly: [{ month: '2026-09', count: 6 }, { month: '2025-11', count: 3 }],
    };
    const { repo } = repoWith(raw);
    const r = await makeGetTranslationStats({ statsRepository: repo, now: () => NOW })({ userId: 1, permissions: granted });
    assert.equal(r.totalTranslations, 10);
    assert.equal(r.activeUsers30d, 2);
    assert.deepEqual(r.daily.map((d) => d.count), [0, 0, 1, 0, 0, 0, 4]);
    assert.deepEqual(r.weekly, [
      { weekStart: '2026-09-14', count: 0 }, { weekStart: '2026-09-21', count: 5 },
      { weekStart: '2026-09-28', count: 0 }, { weekStart: '2026-10-05', count: 0 },
    ]);
    assert.deepEqual(r.monthly[0], { month: '2025-11', count: 3 });
    assert.deepEqual(r.monthly[10], { month: '2026-09', count: 6 });
  });

  test('usa el dia de Bogota: 02:00 UTC del 6 de octubre aun es 5 de octubre', async () => {
    const { repo, windows } = repoWith(empty);
    const r = await makeGetTranslationStats({
      statsRepository: repo, now: () => new Date('2026-10-06T02:00:00Z'),
    })({ userId: 1, permissions: granted });
    assert.equal(r.daily[6].date, '2026-10-05');
    assert.equal(windows[0].dailyFrom, '2026-09-29');
    assert.equal(windows[0].weeklyFrom, '2026-09-14');
    assert.equal(windows[0].monthlyFrom, '2025-11-01');
  });

  test('un domingo cuenta en la semana del lunes anterior (domingo 4 de octubre)', async () => {
    const { repo } = repoWith(empty);
    const r = await makeGetTranslationStats({
      statsRepository: repo, now: () => new Date('2026-10-04T17:00:00Z'),
    })({ userId: 1, permissions: granted });
    assert.equal(r.weekly[3].weekStart, '2026-09-28');
  });

  test('activeSince es 30 dias antes de ahora', async () => {
    const { repo, windows } = repoWith(empty);
    await makeGetTranslationStats({ statsRepository: repo, now: () => NOW })({ userId: 1, permissions: granted });
    assert.equal(windows[0].activeSince.toISOString(), '2026-09-05T15:00:00.000Z');
  });
});
