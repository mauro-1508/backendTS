const pool = require('../config/db');

const translationsRepository = {
  create: async ({ userId, inputText, outputText, type, confidence, source }) => {
    const query = `
      INSERT INTO public.translations
        (user_id, input_text, output_text, type, confidence, source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING translation_id, user_id, input_text, output_text, type,
                confidence, source, is_deleted, created_at
    `;
    const values = [userId ?? null, inputText, outputText, type, confidence ?? null, source ?? null];
    const { rows } = await pool.query(query, values);
    return rows[0];
  },

  listByUser: async ({ userId, limit = 50, offset = 0 }) => {
    const query = `
      SELECT translation_id, user_id, input_text, output_text, type,
             confidence, source, is_deleted, created_at
      FROM public.translations
      WHERE is_deleted = FALSE AND user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(query, [userId, limit, offset]);
    return rows;
  },

  softDelete: async ({ translationId, userId }) => {
    const query = `
      UPDATE public.translations
      SET is_deleted = TRUE
      WHERE translation_id = $1 AND user_id = $2
      RETURNING translation_id
    `;
    const { rows } = await pool.query(query, [translationId, userId]);
    return rows[0];
  },
};

module.exports = translationsRepository;
