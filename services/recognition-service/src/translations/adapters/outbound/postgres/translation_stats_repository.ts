import { TranslationStatsRepository } from '../../../ports/outbound/translation_stats_repository';
import { Pool } from 'pg';

const TZ = `created_at AT TIME ZONE 'America/Bogota'`;

/**
 * Conteo por dia (Bogota) de todas las traducciones: las vigentes de translations mas las
 * vencidas, que la retencion dejo sumadas en translation_daily_counts. Un mismo dia puede
 * estar repartido entre las dos (la retencion corta por hora), por eso se suma, no se elige.
 */
const DAILY = `(
  SELECT user_id, (${TZ})::date AS day, COUNT(*)::int AS c
  FROM public.translations
  WHERE is_deleted = FALSE
  GROUP BY 1, 2
  UNION ALL
  SELECT user_id, day, total FROM public.translation_daily_counts
) AS daily`;

export const makePostgresTranslationStatsRepository = (pool: Pool): TranslationStatsRepository => ({
  getStats: async ({ dailyFrom, weeklyFrom, monthlyFrom, activeSince }) => {
    const [totals, daily, weekly, monthly] = await Promise.all([
      pool.query<{ total: number; active: number }>(
        `SELECT (SELECT COUNT(*) FROM public.translations WHERE is_deleted = FALSE)::int
                + (SELECT COALESCE(SUM(total), 0) FROM public.translation_daily_counts)::int AS total,
                -- Con una retencion menor que la ventana de activos, parte de la ventana ya esta en el resumen.
                (SELECT COUNT(DISTINCT user_id) FROM (
                   SELECT user_id FROM public.translations WHERE is_deleted = FALSE AND created_at >= $1
                   UNION
                   SELECT user_id FROM public.translation_daily_counts
                   WHERE day >= ($1::timestamptz AT TIME ZONE 'America/Bogota')::date
                 ) AS a)::int AS active`,
        [activeSince],
      ),
      pool.query<{ d: string; c: number }>(
        `SELECT to_char(day, 'YYYY-MM-DD') AS d, SUM(c)::int AS c
         FROM ${DAILY}
         WHERE day >= $1::date
         GROUP BY 1`,
        [dailyFrom],
      ),
      pool.query<{ d: string; c: number }>(
        `SELECT to_char(date_trunc('week', day)::date, 'YYYY-MM-DD') AS d, SUM(c)::int AS c
         FROM ${DAILY}
         WHERE day >= $1::date
         GROUP BY 1`,
        [weeklyFrom],
      ),
      pool.query<{ m: string; c: number }>(
        `SELECT to_char(day, 'YYYY-MM') AS m, SUM(c)::int AS c
         FROM ${DAILY}
         WHERE day >= $1::date
         GROUP BY 1`,
        [monthlyFrom],
      ),
    ]);
    return {
      totalTranslations: totals.rows[0].total,
      activeUsers30d: totals.rows[0].active,
      daily: daily.rows.map((r) => ({ date: r.d, count: r.c })),
      weekly: weekly.rows.map((r) => ({ date: r.d, count: r.c })),
      monthly: monthly.rows.map((r) => ({ month: r.m, count: r.c })),
    };
  },
});
