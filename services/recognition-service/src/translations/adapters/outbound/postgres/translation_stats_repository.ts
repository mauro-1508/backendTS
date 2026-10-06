import { TranslationStatsRepository } from '../../../ports/outbound/translation_stats_repository';
import { Pool } from 'pg';

const TZ = `created_at AT TIME ZONE 'America/Bogota'`;

export const makePostgresTranslationStatsRepository = (pool: Pool): TranslationStatsRepository => ({
  getStats: async ({ dailyFrom, weeklyFrom, monthlyFrom, activeSince }) => {
    const [totals, daily, weekly, monthly] = await Promise.all([
      pool.query<{ total: number; active: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(DISTINCT user_id) FILTER (WHERE created_at >= $1)::int AS active
         FROM public.translations
         WHERE is_deleted = FALSE`,
        [activeSince],
      ),
      pool.query<{ d: string; c: number }>(
        `SELECT to_char((${TZ})::date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS c
         FROM public.translations
         WHERE is_deleted = FALSE AND (${TZ})::date >= $1::date
         GROUP BY 1`,
        [dailyFrom],
      ),
      pool.query<{ d: string; c: number }>(
        `SELECT to_char(date_trunc('week', ${TZ})::date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS c
         FROM public.translations
         WHERE is_deleted = FALSE AND (${TZ})::date >= $1::date
         GROUP BY 1`,
        [weeklyFrom],
      ),
      pool.query<{ m: string; c: number }>(
        `SELECT to_char(${TZ}, 'YYYY-MM') AS m, COUNT(*)::int AS c
         FROM public.translations
         WHERE is_deleted = FALSE AND (${TZ})::date >= $1::date
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
