import { MyStatsRepository } from '../../../ports/outbound/my_stats_repository';
import { Pool } from 'pg';

/**
 * "Palabra" = output_text (texto resultado de la traduccion: en sena_texto es la
 * palabra reconocida), normalizado con btrim + lower.
 */
export const makePostgresMyStatsRepository = (pool: Pool): MyStatsRepository => ({
  getMyStats: async (userId) => {
    const [totals, days] = await Promise.all([
      pool.query<{ total: number; words: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(DISTINCT lower(btrim(output_text))) FILTER (WHERE btrim(output_text) <> '')::int AS words
         FROM public.translations
         WHERE user_id = $1 AND is_deleted = FALSE`,
        [userId],
      ),
      pool.query<{ d: string }>(
        `SELECT DISTINCT to_char((created_at AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS d
         FROM public.translations
         WHERE user_id = $1 AND is_deleted = FALSE`,
        [userId],
      ),
    ]);
    return { totalTranslations: totals.rows[0].total, distinctWords: totals.rows[0].words, days: days.rows.map((r) => r.d) };
  },
});
