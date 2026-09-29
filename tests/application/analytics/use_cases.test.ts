import { describe, expect, it } from 'vitest';
import { makeRecordUsageEvent } from '../../../src/domains/analytics/application/record_usage_event';
import { makeGetSectionReport } from '../../../src/domains/analytics/application/get_section_report';
import { InvalidUsageEventError, PermissionDeniedError } from '../../../src/domains/analytics/domain/service';
import { NewUsageEvent } from '../../../src/domains/analytics/domain/entity';
import { UsageEventRepository } from '../../../src/domains/analytics/ports/outbound/usage_event_repository';

const makeFakeRepo = () => {
  const events: NewUsageEvent[] = [];
  const ranges: { from: string; to: string }[] = [];
  const repo: UsageEventRepository = {
    append: async (e) => { events.push(e); },
    countSectionViews: async (range) => {
      ranges.push(range);
      const counts = new Map<string, number>();
      events.filter((e) => e.eventType === 'SECTION_VIEW').forEach((e) => counts.set(e.section, (counts.get(e.section) ?? 0) + 1));
      return [...counts].map(([section, visits]) => ({ section, visits, userId: 1 } as never))
        .sort((a, b) => b.visits - a.visits || a.section.localeCompare(b.section));
    },
  };
  return { repo, events, ranges };
};

const allow = (granted: boolean) => ({ hasPermission: async () => granted });
const view = (userId: number, section: 'HOME' | 'LEXICON') => ({ userId, section, eventType: 'SECTION_VIEW' as const });

describe('record_usage_event', () => {
  it('registra con el userId dado, sessionId null y sin exigir permisos', async () => {
    const { repo, events } = makeFakeRepo();
    await makeRecordUsageEvent({ usageEventRepository: repo })(view(5, 'HOME'));
    expect(events).toEqual([
      { userId: 5, sessionId: null, section: 'HOME', eventType: 'SECTION_VIEW', referenceType: null, referenceId: null },
    ]);
  });

  it('rechaza referencia incompleta sin guardar', async () => {
    const { repo, events } = makeFakeRepo();
    await expect(
      makeRecordUsageEvent({ usageEventRepository: repo })({ ...view(5, 'HOME'), referenceType: 'SIGN' }),
    ).rejects.toThrow(InvalidUsageEventError);
    expect(events).toHaveLength(0);
  });
});

describe('get_section_report', () => {
  const now = () => new Date('2026-09-28T12:00:00.000Z');

  it('sin stats.read lanza PermissionDeniedError y no consulta', async () => {
    const { repo, ranges } = makeFakeRepo();
    const run = makeGetSectionReport({ usageEventRepository: repo, permissionChecker: allow(false), now });
    await expect(run({ userId: 9 })).rejects.toThrow(PermissionDeniedError);
    expect(ranges).toHaveLength(0);
  });

  it('pide stats.read del usuario del token', async () => {
    const { repo } = makeFakeRepo();
    const calls: [number, string][] = [];
    const checker = { hasPermission: async (u: number, p: string) => { calls.push([u, p]); return true; } };
    await makeGetSectionReport({ usageEventRepository: repo, permissionChecker: checker, now })({ userId: 9 });
    expect(calls).toEqual([[9, 'stats.read']]);
  });

  it('devuelve secciones ordenadas por visitas, solo agregados y sin userId', async () => {
    const { repo } = makeFakeRepo();
    const record = makeRecordUsageEvent({ usageEventRepository: repo });
    await record(view(1, 'LEXICON'));
    await record(view(2, 'HOME'));
    await record(view(3, 'HOME'));
    const report = await makeGetSectionReport({ usageEventRepository: repo, permissionChecker: allow(true), now })({ userId: 9 });
    expect(report.sections).toEqual([{ section: 'HOME', visits: 2 }, { section: 'LEXICON', visits: 1 }]);
    expect(report.to).toBe('2026-09-28T12:00:00.000Z');
    expect(JSON.stringify(report)).not.toMatch(/userId|user_id/);
  });

  it('pasa al repo el rango semiabierto: to sin hora = dia siguiente 00:00Z', async () => {
    const { repo, ranges } = makeFakeRepo();
    const uc = makeGetSectionReport({ usageEventRepository: repo, permissionChecker: allow(true), now });
    const report = await uc({ userId: 9, from: '2026-09-01', to: '2026-09-10' });
    expect(ranges[0]).toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-11T00:00:00.000Z' });
    expect(report.to).toBe('2026-09-11T00:00:00.000Z');
    await uc({ userId: 9, from: '2026-09-01T00:00:00.000Z', to: '2026-09-10T10:00:00.000Z' });
    expect(ranges[1].to).toBe('2026-09-10T10:00:00.000Z');
  });

  it('el limite to es exclusivo: evento en to no cuenta, en to - 1 ms si (semantica created_at >= from AND < to)', async () => {
    const stamped = [{ at: '2026-09-11T00:00:00.000Z' }, { at: '2026-09-10T23:59:59.999Z' }];
    const repo: UsageEventRepository = {
      append: async () => {},
      countSectionViews: async ({ from, to }) => {
        const visits = stamped.filter((e) => e.at >= from && e.at < to).length;
        return visits ? [{ section: 'HOME', visits }] : [];
      },
    };
    const report = await makeGetSectionReport({ usageEventRepository: repo, permissionChecker: allow(true), now })({ userId: 9, from: '2026-09-10', to: '2026-09-10' });
    expect(report.sections).toEqual([{ section: 'HOME', visits: 1 }]);
  });
});
