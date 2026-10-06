/** Estadistica de traducciones. Todas las fechas se agrupan en hora de Bogota (UTC-5, sin horario de verano). */
export class PermissionDeniedError extends Error {}

export interface CountByDate { date: string; count: number }
export interface CountByMonth { month: string; count: number }

/** Lo que devuelve el repositorio: solo filas con datos (sin ceros). */
export interface StatsRaw {
  totalTranslations: number;
  activeUsers30d: number;
  daily: CountByDate[];
  weekly: CountByDate[]; // date = lunes de la semana
  monthly: CountByMonth[];
}

export interface StatsWindow {
  dailyFrom: string; // YYYY-MM-DD (Bogota)
  weeklyFrom: string; // lunes YYYY-MM-DD
  monthlyFrom: string; // primer dia del mes YYYY-MM-DD
  activeSince: Date;
}

export interface TranslationStats {
  totalTranslations: number;
  activeUsers30d: number;
  daily: { date: string; count: number }[];
  weekly: { weekStart: string; count: number }[];
  monthly: { month: string; count: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Medianoche UTC del dia calendario de Bogota en el instante `now`. */
const bogotaToday = (now: Date): number => Math.floor((now.getTime() - BOGOTA_OFFSET_MS) / DAY_MS) * DAY_MS;

const mondayOf = (dayMs: number): number => {
  const dow = new Date(dayMs).getUTCDay(); // 0 = domingo
  return dayMs - ((dow + 6) % 7) * DAY_MS;
};

const monthStart = (dayMs: number, back: number): number => {
  const d = new Date(dayMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1);
};

export const translationStatsDomain = {
  window(now: Date): StatsWindow {
    const today = bogotaToday(now);
    return {
      dailyFrom: iso(today - 6 * DAY_MS),
      weeklyFrom: iso(mondayOf(today) - 3 * 7 * DAY_MS),
      monthlyFrom: iso(monthStart(today, 11)),
      activeSince: new Date(now.getTime() - 30 * DAY_MS),
    };
  },

  /** Rellena con ceros y deja todo en orden ascendente. */
  build(raw: StatsRaw, now: Date): TranslationStats {
    const today = bogotaToday(now);
    const dailyMap = new Map(raw.daily.map((r) => [r.date, r.count]));
    const weeklyMap = new Map(raw.weekly.map((r) => [r.date, r.count]));
    const monthlyMap = new Map(raw.monthly.map((r) => [r.month, r.count]));

    const daily = Array.from({ length: 7 }, (_, i) => {
      const date = iso(today - (6 - i) * DAY_MS);
      return { date, count: dailyMap.get(date) ?? 0 };
    });
    const weekly = Array.from({ length: 4 }, (_, i) => {
      const weekStart = iso(mondayOf(today) - (3 - i) * 7 * DAY_MS);
      return { weekStart, count: weeklyMap.get(weekStart) ?? 0 };
    });
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const month = iso(monthStart(today, 11 - i)).slice(0, 7);
      return { month, count: monthlyMap.get(month) ?? 0 };
    });

    return { totalTranslations: raw.totalTranslations, activeUsers30d: raw.activeUsers30d, daily, weekly, monthly };
  },
};
