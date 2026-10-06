import { DailyUsage, DateRange, SectionVisits, TopSign, UsageEvent, UsageSummary } from './entity';

export interface UsageEventRepository {
  /** Guarda el evento; devuelve false si ya existia uno con el mismo eventId (idempotencia). */
  save(event: UsageEvent): Promise<boolean>;
  summary(range: DateRange): Promise<UsageSummary>;
  topSigns(range: DateRange, limit: number): Promise<TopSign[]>;
  dailySeries(range: DateRange): Promise<DailyUsage[]>;
  /** Visitas por seccion (eventos SECTION_VIEW), de mas a menos visitada. */
  sectionViews(range: DateRange): Promise<SectionVisits[]>;
}
