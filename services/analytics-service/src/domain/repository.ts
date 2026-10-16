import { DailyUsage, DateRange, SectionVisits, TopSign, UsageEvent, UsageSummary } from './entity';

export interface UsageEventRepository {
  /** Guarda el evento; devuelve false si ya existia uno con el mismo eventId (idempotencia). */
  save(event: UsageEvent): Promise<boolean>;
  /**
   * Supresion de cuenta (HU-USG-004): los hechos de uso sobreviven a la persona pero sin ligarla
   * (user_id NULL; reference_type/id NULL cuando apuntaban al usuario) y el id queda registrado
   * como borrado, todo en una transaccion. Idempotente.
   */
  unlinkUser(userId: string): Promise<void>;
  /** True si el usuario ya fue borrado: sus eventos tardios no deben volver a ligarse a el. */
  isUserErased(userId: string): Promise<boolean>;
  summary(range: DateRange): Promise<UsageSummary>;
  topSigns(range: DateRange, limit: number): Promise<TopSign[]>;
  dailySeries(range: DateRange): Promise<DailyUsage[]>;
  /** Visitas por seccion (eventos SECTION_VIEW), de mas a menos visitada. */
  sectionViews(range: DateRange): Promise<SectionVisits[]>;
}
