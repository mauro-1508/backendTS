import { NewUsageEvent, REFERENCE_TYPES, USAGE_EVENT_TYPES, USAGE_SECTIONS } from './entity';

export class InvalidUsageEventError extends Error {}
export class InvalidRangeError extends Error {}
export class PermissionDeniedError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const parseBound = (value: string | Date, exclusiveEnd: boolean): number => {
  // Rango semiabierto [from, to): un "to" sin hora es el inicio (00:00Z) del dia siguiente, exclusivo.
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) throw new InvalidRangeError('Fecha invalida');
  return typeof value === 'string' && DATE_ONLY.test(value) && exclusiveEnd ? ms + DAY_MS : ms;
};

const startOfUtcDay = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;

export const analyticsDomainService = {
  /** Catalogos cerrados; referenceType y referenceId van juntos o ninguno. */
  ensureEventIsValid(event: Pick<NewUsageEvent, 'section' | 'eventType' | 'referenceType' | 'referenceId'>): void {
    if (!(USAGE_SECTIONS as readonly string[]).includes(event.section)) {
      throw new InvalidUsageEventError('section invalida');
    }
    if (!(USAGE_EVENT_TYPES as readonly string[]).includes(event.eventType)) {
      throw new InvalidUsageEventError('eventType invalido');
    }
    if ((event.referenceType == null) !== (event.referenceId == null)) {
      throw new InvalidUsageEventError('referenceType y referenceId van juntos');
    }
    if (event.referenceType != null && !(REFERENCE_TYPES as readonly string[]).includes(event.referenceType)) {
      throw new InvalidUsageEventError('referenceType invalido');
    }
    if (event.referenceId != null && (!Number.isInteger(event.referenceId) || event.referenceId <= 0)) {
      throw new InvalidUsageEventError('referenceId invalido');
    }
  },

  /**
   * Rango semiabierto [from, to) en UTC (deuda: America/Bogota); from <= to, maximo 366 dias.
   * Sin from ni to: ultimos 30 dias hasta now. Solo to: from = inicio (00:00Z) del dia de (to - 30 dias),
   * asi no hereda horas finales. Solo from: to = now.
   */
  normalizeRange(range: { from?: string | Date; to?: string | Date }, now: Date): { from: string; to: string } {
    const to = range.to != null ? parseBound(range.to, true) : now.getTime();
    let from: number;
    if (range.from != null) from = parseBound(range.from, false);
    else if (range.to != null) from = startOfUtcDay(to - DEFAULT_RANGE_DAYS * DAY_MS);
    else from = to - DEFAULT_RANGE_DAYS * DAY_MS;
    if (from > to) throw new InvalidRangeError('from debe ser anterior o igual a to');
    if (to - from > MAX_RANGE_DAYS * DAY_MS) throw new InvalidRangeError('El rango maximo es de 366 dias');
    return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  },
};
