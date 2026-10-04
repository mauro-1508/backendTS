import { DailyUsage, DateRange, TopSign, UsageEvent, UsageSummary } from '../../src/domain/entity';
import { UsageEventRepository } from '../../src/domain/repository';

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const localDay = (date: Date): string => new Date(date.getTime() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);

/** Repositorio en memoria con la misma semantica que el de Postgres (unico por eventId, dia de Bogota). */
export const makeInMemoryUsageRepository = (): UsageEventRepository & { events: UsageEvent[] } => {
  const events: UsageEvent[] = [];
  const inRange = ({ from, to }: DateRange) => events.filter(e => localDay(e.createdAt) >= from && localDay(e.createdAt) <= to);
  const count = (list: UsageEvent[], type: string) => list.filter(e => e.eventType === type).length;

  return {
    events,
    async save(event) {
      if (events.some(e => e.eventId === event.eventId)) return false;
      events.push(event);
      return true;
    },
    async summary(range): Promise<UsageSummary> {
      const list = inRange(range);
      return { translations: count(list, 'TRANSLATION_COMPLETED'), newUsers: count(list, 'USER_REGISTERED') };
    },
    async topSigns(range, limit): Promise<TopSign[]> {
      const totals = new Map<string, number>();
      inRange(range).filter(e => e.eventType === 'TRANSLATION_COMPLETED')
        .forEach(e => e.signCodes.forEach(code => totals.set(code, (totals.get(code) ?? 0) + 1)));
      return [...totals].map(([signCode, translations]) => ({ signCode, translations }))
        .sort((a, b) => b.translations - a.translations || a.signCode.localeCompare(b.signCode))
        .slice(0, limit);
    },
    async dailySeries(range): Promise<DailyUsage[]> {
      const days = [...new Set(inRange(range).map(e => localDay(e.createdAt)))].sort();
      return days.map(date => {
        const list = inRange({ from: date, to: date });
        return { date, translations: count(list, 'TRANSLATION_COMPLETED'), newUsers: count(list, 'USER_REGISTERED') };
      });
    },
  };
};
