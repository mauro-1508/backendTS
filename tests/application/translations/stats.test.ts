import { describe, expect, it, vi } from 'vitest';
import { makeGetTranslationStats } from '../../../src/domains/translations/application/get_translation_stats';
import { PermissionDeniedError, StatsRaw, StatsWindow } from '../../../src/domains/translations/domain/stats';
import { TranslationStatsRepository } from '../../../src/domains/translations/ports/outbound/translation_stats_repository';

// 2026-10-05 es lunes; 10:00 en Bogota = 15:00 UTC.
const NOW = new Date('2026-10-05T15:00:00Z');
const empty: StatsRaw = { totalTranslations: 0, activeUsers30d: 0, daily: [], weekly: [], monthly: [] };
const allow = (granted: boolean) => ({ hasPermission: vi.fn().mockResolvedValue(granted) });
const repoWith = (raw: StatsRaw) => {
  const windows: StatsWindow[] = [];
  const repo: TranslationStatsRepository = { getStats: async (w) => { windows.push(w); return raw; } };
  return { repo, windows };
};

describe('get_translation_stats', () => {
  it('sin permiso lanza PermissionDeniedError y no consulta el repositorio', async () => {
    const { repo } = repoWith(empty);
    const spy = vi.spyOn(repo, 'getStats');
    const checker = allow(false);
    await expect(
      makeGetTranslationStats({ statsRepository: repo, permissionChecker: checker, now: () => NOW })({ userId: 3 }),
    ).rejects.toThrow(PermissionDeniedError);
    expect(checker.hasPermission).toHaveBeenCalledWith(3, 'stats.read');
    expect(spy).not.toHaveBeenCalled();
  });

  it('rellena con ceros: 7 dias, 4 semanas y 12 meses en orden ascendente', async () => {
    const { repo } = repoWith(empty);
    const r = await makeGetTranslationStats({ statsRepository: repo, permissionChecker: allow(true), now: () => NOW })({ userId: 1 });
    expect(r.daily.map((d) => d.date)).toEqual([
      '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    ]);
    expect(r.weekly.map((w) => w.weekStart)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']);
    expect(r.monthly.map((m) => m.month)).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ]);
    for (const list of [r.daily, r.weekly, r.monthly]) expect(list.every((x) => x.count === 0)).toBe(true);
  });

  it('coloca los conteos en su posicion y deja 0 en el resto', async () => {
    const raw: StatsRaw = {
      totalTranslations: 10,
      activeUsers30d: 2,
      daily: [{ date: '2026-10-05', count: 4 }, { date: '2026-10-01', count: 1 }],
      weekly: [{ date: '2026-09-21', count: 5 }],
      monthly: [{ month: '2026-09', count: 6 }, { month: '2025-11', count: 3 }],
    };
    const { repo } = repoWith(raw);
    const r = await makeGetTranslationStats({ statsRepository: repo, permissionChecker: allow(true), now: () => NOW })({ userId: 1 });
    expect(r.totalTranslations).toBe(10);
    expect(r.activeUsers30d).toBe(2);
    expect(r.daily.map((d) => d.count)).toEqual([0, 0, 1, 0, 0, 0, 4]);
    expect(r.weekly).toEqual([
      { weekStart: '2026-09-14', count: 0 }, { weekStart: '2026-09-21', count: 5 },
      { weekStart: '2026-09-28', count: 0 }, { weekStart: '2026-10-05', count: 0 },
    ]);
    expect(r.monthly[0]).toEqual({ month: '2025-11', count: 3 });
    expect(r.monthly[10]).toEqual({ month: '2026-09', count: 6 });
  });

  it('usa el dia de Bogota: 02:00 UTC del 6 de octubre aun es 5 de octubre', async () => {
    const { repo, windows } = repoWith(empty);
    const r = await makeGetTranslationStats({
      statsRepository: repo, permissionChecker: allow(true), now: () => new Date('2026-10-06T02:00:00Z'),
    })({ userId: 1 });
    expect(r.daily[6].date).toBe('2026-10-05');
    expect(windows[0]).toMatchObject({ dailyFrom: '2026-09-29', weeklyFrom: '2026-09-14', monthlyFrom: '2025-11-01' });
  });

  it('un domingo cuenta en la semana del lunes anterior (domingo 4 de octubre)', async () => {
    const { repo } = repoWith(empty);
    const r = await makeGetTranslationStats({
      statsRepository: repo, permissionChecker: allow(true), now: () => new Date('2026-10-04T17:00:00Z'),
    })({ userId: 1 });
    expect(r.weekly[3].weekStart).toBe('2026-09-28');
  });

  it('activeSince es 30 dias antes de ahora', async () => {
    const { repo, windows } = repoWith(empty);
    await makeGetTranslationStats({ statsRepository: repo, permissionChecker: allow(true), now: () => NOW })({ userId: 1 });
    expect(windows[0].activeSince.toISOString()).toBe('2026-09-05T15:00:00.000Z');
  });
});
