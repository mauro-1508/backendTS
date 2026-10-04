import { DailyUsage, DateRange, TopSign, UsageEvent, UsageSummary } from './entity';

export interface UsageEventRepository {
  /** Guarda el evento; devuelve false si ya existia uno con el mismo eventId (idempotencia). */
  save(event: UsageEvent): Promise<boolean>;
  summary(range: DateRange): Promise<UsageSummary>;
  topSigns(range: DateRange, limit: number): Promise<TopSign[]>;
  dailySeries(range: DateRange): Promise<DailyUsage[]>;
}
