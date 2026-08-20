import { TranslationRepository } from '../../../ports/outbound/translation_repository';
import { NewTranslation, Translation, TranslationType } from '../../../domain/translation/entity';
import { pool } from './postgres';

interface TranslationRow {
  translation_id: number;
  user_id: number | null;
  input_text: string;
  output_text: string;
  type: TranslationType;
  confidence: number | null;
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
  confidence: row.confidence,
  source: row.source,
  isDeleted: row.is_deleted,
  createdAt: row.created_at,
});

export const postgresTranslationRepository: TranslationRepository = {
  create: async ({ userId, inputText, outputText, type, confidence, source }: NewTranslation) => {
    const { rows } = await pool.query<TranslationRow>(
      `INSERT INTO public.translations
         (user_id, input_text, output_text, type, confidence, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING translation_id, user_id, input_text, output_text, type,
                 confidence, source, is_deleted, created_at`,
      [userId ?? null, inputText, outputText, type, confidence ?? null, source ?? null]
    );
    return toTranslation(rows[0]);
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
};
