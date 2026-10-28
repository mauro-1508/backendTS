import { MyStatsRepository } from '../../../ports/outbound/my_stats_repository';
import { Pool } from 'pg';

/**
 * "Palabra" = output_text (texto resultado de la traduccion: en sena_texto es la
 * palabra reconocida), normalizado con btrim + lower.
 * Las traducciones vencidas ya no estan en translations: sus conteos, palabras y dias
 * vienen del resumen que deja la retencion (translation_daily_counts / translation_user_words).
 */
export const makePostgresMyStatsRepository = (pool: Pool): MyStatsRepository => ({
  getMyStats: async (userId) => {
    const [totals, days] = await Promise.all([
      pool.query<{ total: number; words: number }>(
        `SELECT (SELECT COUNT(*) FROM public.translations WHERE user_id = $1 AND is_deleted = FALSE)::int
                + (SELECT COALESCE(SUM(total), 0) FROM public.translation_daily_counts WHERE user_id = $1)::int AS total,
                (SELECT COUNT(*) FROM (
                   SELECT lower(btrim(output_text)) FROM public.translations
                   WHERE user_id = $1 AND is_deleted = FALSE AND btrim(output_text) <> ''
                   UNION
                   SELECT word FROM public.translation_user_words WHERE user_id = $1
                 ) AS w)::int AS words`,
        [userId],
      ),
      pool.query<{ d: string }>(
        `SELECT to_char((created_at AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS d
         FROM public.translations
         WHERE user_id = $1 AND is_deleted = FALSE
         UNION
         SELECT to_char(day, 'YYYY-MM-DD') FROM public.translation_daily_counts WHERE user_id = $1`,
        [userId],
      ),
    ]);
    return { totalTranslations: totals.rows[0].total, distinctWords: totals.rows[0].words, days: days.rows.map((r) => r.d) };
  },
});
