import { DailyUsage, SectionReport, TopSign, UsageSummary } from '../../domain/entity';

export interface RecordEventInput {
  userId: number;
  section: unknown;
  eventType: unknown;
  sessionId?: unknown;
  referenceType?: unknown;
  referenceId?: unknown;
}

export interface RangeInput {
  from?: unknown;
  to?: unknown;
}

export interface AnalyticsService {
  recordEvent(input: RecordEventInput): Promise<void>;
  summary(input: RangeInput): Promise<UsageSummary>;
  topSigns(input: RangeInput & { limit?: unknown }): Promise<TopSign[]>;
  dailySeries(input: RangeInput): Promise<DailyUsage[]>;
  sectionReport(input: RangeInput): Promise<SectionReport>;
}
