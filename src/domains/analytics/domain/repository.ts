import { NewUsageEvent, SectionReportRow } from './entity';

export interface UsageEventRepository {
  /** Append-only: los eventos no se modifican ni se borran. */
  append(event: NewUsageEvent): Promise<void>;
  /** Eventos SECTION_VIEW en [from, to] agrupados por seccion; visitas desc, seccion asc. */
  countSectionViews(range: { from: string; to: string }): Promise<SectionReportRow[]>;
}
