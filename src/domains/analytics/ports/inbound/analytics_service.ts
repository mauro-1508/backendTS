import { NewUsageEvent, SectionReportRow } from '../../domain/entity';

export interface RecordUsageEventInput {
  userId: number;
  section: NewUsageEvent['section'];
  eventType: NewUsageEvent['eventType'];
  referenceType?: string | null;
  referenceId?: number | null;
}

export interface SectionReport {
  from: string;
  /** Limite superior EXCLUSIVO, en UTC (deuda: America/Bogota). */
  to: string;
  sections: SectionReportRow[];
}

export interface AnalyticsService {
  recordUsageEvent(input: RecordUsageEventInput): Promise<void>;
  getSectionReport(input: { userId: number; from?: string; to?: string }): Promise<SectionReport>;
}
