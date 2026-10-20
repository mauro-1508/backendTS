export type ReportKind = 'WEEKLY' | 'MONTHLY' | 'MODEL_REMINDER';

export interface DateRange { from: string; to: string }
export interface Period { kind: ReportKind; periodKey: string; current: DateRange; previous: DateRange }

const REPORT_HOUR = 8;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
const ISO_THURSDAY_OFFSET_DAYS = 3;

// Ventana de gracia: desde la hora programada hasta el fin del ultimo dia indicado. Pasada la ventana
// el reporte se descarta (un reinicio tardio no manda reportes viejos).
/** Semanal: lunes 08:00 hasta el martes 23:59 (dias desde el lunes: 0 y 1). */
const WEEKLY_LAST_DAY_FROM_MONDAY = 1;
/** Mensual: dia 1 a las 08:00 hasta el dia 3 a las 23:59. */
const MONTHLY_LAST_DAY_OF_MONTH = 3;
/** Recordatorio: miercoles 08:00 hasta el jueves 23:59 (dias desde el lunes: 2 y 3). */
const REMINDER_FIRST_DAY_FROM_MONDAY = 2;
const REMINDER_LAST_DAY_FROM_MONDAY = 3;

// ---- Calendario de Bogota (UTC-5 fijo) ----

/** Reloj de Bogota: sus getUTC* devuelven la hora local. */
const bogotaClock = (now: Date): Date => new Date(now.getTime() - BOGOTA_OFFSET_MS);
const dayStart = (local: Date): number => Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const mondayOf = (dayMs: number): number => dayMs - ((new Date(dayMs).getUTCDay() + 6) % DAYS_PER_WEEK) * DAY_MS;
const weekdayFromMonday = (local: Date): number => (local.getUTCDay() + 6) % DAYS_PER_WEEK;

/** Semana ISO ("2026-W43") de la semana que empieza en `mondayMs`. */
const isoWeekKey = (mondayMs: number): string => {
  const thursday = mondayMs + ISO_THURSDAY_OFFSET_DAYS * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / DAYS_PER_WEEK) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
};

const weekRange = (mondayMs: number): DateRange => ({
  from: isoDate(mondayMs),
  to: isoDate(mondayMs + (DAYS_PER_WEEK - 1) * DAY_MS),
});

const monthRange = (year: number, month: number): DateRange => ({
  from: isoDate(Date.UTC(year, month, 1)),
  to: isoDate(Date.UTC(year, month + 1, 1) - DAY_MS),
});

/** Periodo que cubre cada reporte: semana o mes cerrados (el recordatorio usa la semana en curso). */
export const periodOf = (kind: ReportKind, now: Date): Period => {
  const local = bogotaClock(now);
  const thisMonday = mondayOf(dayStart(local));
  if (kind === 'MONTHLY') {
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const closed = monthRange(year, month - 1);
    return { kind, periodKey: closed.from.slice(0, 7), current: closed, previous: monthRange(year, month - 2) };
  }
  const currentMonday = kind === 'WEEKLY' ? thisMonday - DAYS_PER_WEEK * DAY_MS : thisMonday;
  return {
    kind,
    periodKey: isoWeekKey(currentMonday),
    current: weekRange(currentMonday),
    previous: weekRange(currentMonday - DAYS_PER_WEEK * DAY_MS),
  };
};

/**
 * Reportes dentro de su ventana de envio: semanal lunes 08:00 a martes 23:59, mensual dia 1 08:00 a
 * dia 3 23:59 y recordatorio miercoles 08:00 a jueves 23:59 (hora de Bogota). Dentro de la ventana
 * el periodo se reclama una sola vez.
 */
export const dueReports = (now: Date): ReportKind[] => {
  const local = bogotaClock(now);
  const reached = local.getUTCHours() >= REPORT_HOUR;
  const weekday = weekdayFromMonday(local);
  const dayOfMonth = local.getUTCDate();
  const due: ReportKind[] = [];
  if ((weekday === 0 && reached) || (weekday > 0 && weekday <= WEEKLY_LAST_DAY_FROM_MONDAY)) due.push('WEEKLY');
  if ((dayOfMonth === 1 && reached) || (dayOfMonth > 1 && dayOfMonth <= MONTHLY_LAST_DAY_OF_MONTH)) due.push('MONTHLY');
  if (
    (weekday === REMINDER_FIRST_DAY_FROM_MONDAY && reached)
    || (weekday > REMINDER_FIRST_DAY_FROM_MONDAY && weekday <= REMINDER_LAST_DAY_FROM_MONDAY)
  ) due.push('MODEL_REMINDER');
  return due;
};
