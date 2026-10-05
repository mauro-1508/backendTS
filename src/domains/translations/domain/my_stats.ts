/** Estadisticas del propio usuario (Perfil). Los dias se calculan en hora de Bogota (UTC-5). */
export interface MyStats {
  totalTranslations: number;
  distinctWords: number;
  activeDays: number;
  currentStreakDays: number;
  longestStreakDays: number;
}

/** Lo que devuelve el repositorio: `days` son fechas YYYY-MM-DD (Bogota) distintas, sin orden garantizado. */
export interface MyStatsRaw {
  totalTranslations: number;
  distinctWords: number;
  days: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const toMs = (d: string): number => Date.parse(`${d}T00:00:00Z`);

const bogotaToday = (now: Date): string =>
  new Date(Math.floor((now.getTime() - BOGOTA_OFFSET_MS) / DAY_MS) * DAY_MS).toISOString().slice(0, 10);

export const myStatsDomain = {
  bogotaToday,

  build(raw: MyStatsRaw, now: Date): MyStats {
    const days = [...new Set(raw.days)].map(toMs).sort((a, b) => a - b);

    let longest = 0;
    let run = 0;
    days.forEach((d, i) => {
      run = i > 0 && d - days[i - 1] === DAY_MS ? run + 1 : 1;
      longest = Math.max(longest, run);
    });

    // La racha sigue viva si el ultimo dia activo es hoy o ayer.
    const today = toMs(bogotaToday(now));
    let current = 0;
    const last = days[days.length - 1];
    if (last === today || last === today - DAY_MS) {
      current = 1;
      for (let i = days.length - 2; i >= 0 && days[i + 1] - days[i] === DAY_MS; i--) current++;
    }

    return {
      totalTranslations: raw.totalTranslations,
      distinctWords: raw.distinctWords,
      activeDays: days.length,
      currentStreakDays: current,
      longestStreakDays: longest,
    };
  },
};
