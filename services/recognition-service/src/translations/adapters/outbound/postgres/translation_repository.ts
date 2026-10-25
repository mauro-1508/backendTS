import { Pool } from 'pg';
import { TranslationRepository } from '../../../ports/outbound/translation_repository';
import { AccountErasedError } from '../../../../common/domain/errors';
import { NewTranslation, Translation, TranslationType } from '../../../domain/entity';


interface TranslationRow {
  translation_id: number;
  user_id: number | null;
  input_text: string;
  output_text: string;
  type: TranslationType;
  // node-pg entrega NUMERIC como string para no perder precision.
  confidence: string | null;
  source: string | null;
  is_deleted: boolean;
  created_at: Date;
}

const toTranslation = (row: TranslationRow): Translation => ({
  translationId: row.translation_id,
  userId: row.user_id,
  inputText: row.input_text,
  outputText: row.output_text,
  type: row.type,
  confidence: row.confidence == null ? null : Number(row.confidence),
  source: row.source,
  isDeleted: row.is_deleted,
  createdAt: row.created_at,
});

/** Serializa creacion y supresion del mismo usuario: o la traduccion existe antes y se borra, o ve erased_users. */
const LOCK_USER = "SELECT pg_advisory_xact_lock(hashtext('erased_user'), $1::int)";

export const makePostgresTranslationRepository = (pool: Pool): TranslationRepository => ({
  create: async ({ userId, inputText, outputText, type, confidence, source }: NewTranslation) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (userId != null) await client.query(LOCK_USER, [userId]);
      // INSERT condicional: si el usuario esta en erased_users no se inserta nada.
      const { rows } = await client.query<TranslationRow>(
        `INSERT INTO public.translations
           (user_id, input_text, output_text, type, confidence, source)
         SELECT $1::int, $2, $3, $4, $5, $6
         WHERE $1::int IS NULL OR NOT EXISTS (SELECT 1 FROM public.erased_users WHERE user_id = $1::int)
         RETURNING translation_id, user_id, input_text, output_text, type,
                   confidence, source, is_deleted, created_at`,
        [userId ?? null, inputText, outputText, type, confidence ?? null, source ?? null]
      );
      await client.query('COMMIT');
      if (!rows[0]) throw new AccountErasedError();
      return toTranslation(rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },

  listByUser: async ({ userId, limit, offset }) => {
    const { rows } = await pool.query<TranslationRow>(
      `SELECT translation_id, user_id, input_text, output_text, type,
              confidence, source, is_deleted, created_at
       FROM public.translations
       WHERE is_deleted = FALSE AND user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows.map(toTranslation);
  },

  eraseUser: async userId => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(LOCK_USER, [userId]);
      await client.query('INSERT INTO public.erased_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
      const result = await client.query('DELETE FROM public.translations WHERE user_id = $1', [userId]);
      // El resumen de la retencion tambien es suyo: se borra con la cuenta.
      await client.query('DELETE FROM public.translation_daily_counts WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM public.translation_user_words WHERE user_id = $1', [userId]);
      await client.query('COMMIT');
      return result.rowCount ?? 0;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },

  softDelete: async ({ translationId, userId }) => {
    const { rows } = await pool.query<{ translation_id: number }>(
      `UPDATE public.translations
       SET is_deleted = TRUE
       WHERE translation_id = $1 AND user_id = $2
       RETURNING translation_id`,
      [translationId, userId]
    );
    return rows[0] ? { translationId: rows[0].translation_id } : null;
  },

  purgeOlderThan: async cutoff => {
    // Una sola sentencia: el DELETE y los dos INSERT del resumen se aplican juntos o ninguno.
    // Las que el usuario ya habia borrado (is_deleted) se eliminan sin sumar, como en las estadisticas.
    const { rows } = await pool.query<{ purged: number }>(
      `WITH old AS (
         DELETE FROM public.translations
         WHERE created_at < $1
         RETURNING user_id, output_text, created_at, is_deleted
       ), counted AS (
         INSERT INTO public.translation_daily_counts (user_id, day, total)
         SELECT user_id, (created_at AT TIME ZONE 'America/Bogota')::date, COUNT(*)::int
         FROM old
         WHERE is_deleted = FALSE
         GROUP BY 1, 2
         ON CONFLICT (user_id, day) DO UPDATE
           SET total = public.translation_daily_counts.total + EXCLUDED.total
       ), words AS (
         INSERT INTO public.translation_user_words (user_id, word)
         SELECT DISTINCT user_id, lower(btrim(output_text))
         FROM old
         WHERE is_deleted = FALSE AND user_id IS NOT NULL AND btrim(output_text) <> ''
         ON CONFLICT DO NOTHING
       )
       SELECT COUNT(*)::int AS purged FROM old`,
      [cutoff],
    );
    return rows[0]?.purged ?? 0;
  },
});
