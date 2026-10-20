import { SectionVisits, SignTemplateSummary, TranslationStats } from '../domain/admin_report';
import { DateRange } from '../domain/admin_report_schedule';

/** Estadisticas de otros servicios que alimentan los resumenes de administracion. */
export interface StatsGateway {
  translationStats(): Promise<TranslationStats>;
  sectionVisits(range: DateRange): Promise<SectionVisits[]>;
  signTemplateSummary(): Promise<SignTemplateSummary>;
}
