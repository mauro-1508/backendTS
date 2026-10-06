/** Estadisticas del propio usuario (Perfil). Los dias se calculan en hora de Bogota (UTC-5). */
export interface MyStats {
  totalTranslations: number;
  distinctWords: number;
  activeDays: number;
}

/** Lo que devuelve el repositorio: `days` son fechas YYYY-MM-DD (Bogota) distintas, sin orden garantizado. */
export interface MyStatsRaw {
  totalTranslations: number;
  distinctWords: number;
  days: string[];
}

export const myStatsDomain = {
  build(raw: MyStatsRaw): MyStats {
    return {
      totalTranslations: raw.totalTranslations,
      distinctWords: raw.distinctWords,
      activeDays: new Set(raw.days).size,
    };
  },
};
