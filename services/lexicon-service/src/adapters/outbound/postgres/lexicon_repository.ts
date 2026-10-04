import { Pool, PoolClient } from 'pg';
import { FindSignOptions, LexiconRepository } from '../../../domain/repository';
import {
  DEFAULT_UI_LANGUAGE, Localization, MultimediaResource, NewResource, ResourceType, Sign, SignChanges,
  SignStatus, SignType, UiLanguage,
} from '../../../domain/entity';
import { CodeTakenError, LetterTakenError, PositionTakenError } from '../../../domain/rules';

interface ResourceRow {
  resource_id: number;
  type: ResourceType;
  url: string;
  mime_type: string | null;
  display_order: number | null;
  description: string | null;
}

interface SignRow {
  lexicon_id: number;
  code: string;
  word: string;
  meaning: string | null;
  type: SignType;
  letter: string | null;
  language: string;
  category_id: number;
  category: string;
  description: string | null;
  is_animated: boolean;
  display_order: number;
  status: SignStatus;
  created_at: Date;
  updated_at: Date;
  resources: ResourceRow[] | null;
}

interface LocalizationRow {
  ui_language: UiLanguage;
  name: string;
  meaning: string | null;
  description: string | null;
}

const toResource = (row: ResourceRow): MultimediaResource => ({
  resourceId: row.resource_id,
  type: row.type,
  url: row.url,
  mimeType: row.mime_type,
  displayOrder: row.display_order ?? 1,
  description: row.description,
});

const toLocalization = (row: LocalizationRow): Localization => ({
  uiLanguage: row.ui_language,
  name: row.name,
  meaning: row.meaning,
  description: row.description,
});

const toSign = (row: SignRow): Sign => ({
  lexiconId: row.lexicon_id,
  code: row.code,
  word: row.word,
  meaning: row.meaning,
  type: row.type,
  // CHAR(1) llega con relleno si alguna vez se guardo vacio.
  letter: row.letter?.trim() || null,
  language: row.language,
  categoryId: row.category_id,
  category: row.category,
  description: row.description,
  animated: row.is_animated,
  displayOrder: row.display_order,
  status: row.status,
  resources: (row.resources ?? []).map(toResource),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Todas las consultas de lectura reciben el idioma de la interfaz en $1.
 * La localizacion mostrada es la de ese idioma, luego ES, luego cualquiera.
 * Los recursos viajan agregados en la misma fila: una sola consulta por listado.
 */
const SELECT_SIGN = `
  SELECT s.lexicon_id, s.code, COALESCE(l.name, s.code) AS word, l.meaning, s.type, s.letter, s.language,
         s.category_id, c.name AS category, l.description,
         s.is_animated, s.display_order, s.status, s.created_at, s.updated_at,
         COALESCE(
           (SELECT json_agg(json_build_object(
                     'resource_id', r.resource_id, 'type', r.type, 'url', r.url,
                     'mime_type', r.mime_type, 'display_order', r.display_order,
                     'description', r.description)
                   ORDER BY r.display_order, r.resource_id)
            FROM public.multimedia_resource r
            WHERE r.lexicon_id = s.lexicon_id),
           '[]'::json
         ) AS resources
  FROM public.sign_lexicon s
  JOIN public.categories c ON c.category_id = s.category_id
  LEFT JOIN LATERAL (
    SELECT sl.name, sl.meaning, sl.description
    FROM public.sign_localizations sl
    WHERE sl.lexicon_id = s.lexicon_id
    ORDER BY (sl.ui_language = $1) DESC, (sl.ui_language = 'ES') DESC, sl.ui_language
    LIMIT 1
  ) l ON TRUE`;

/** 0 exacto, 1 empieza por, 2 contiene, 3 no coincide. Insensible a mayusculas; sin LIKE para no escapar comodines. */
const rank = (column: string, q: string) => `
  CASE WHEN lower(${column}) = lower(${q}) THEN 0
       WHEN strpos(lower(${column}), lower(${q})) = 1 THEN 1
       WHEN strpos(lower(${column}), lower(${q})) > 1 THEN 2
       ELSE 3 END`;

const RELEVANCE = `LEAST(${rank('COALESCE(l.name, s.code)', '$5::varchar')}, ${rank('s.code', '$5::varchar')})`;

const findSignByCode = async (pool: Pool, code: string, options: FindSignOptions = {}): Promise<Sign | null> => {
  const lang = options.lang ?? DEFAULT_UI_LANGUAGE;
  const { rows } = await pool.query<SignRow>(
    `${SELECT_SIGN}
     WHERE s.code = $2 AND ($3::boolean OR s.status = 'ACTIVE')`,
    [lang, code, options.includeInactive ?? false]
  );
  if (!rows[0]) return null;
  const sign = toSign(rows[0]);
  const locs = await pool.query<LocalizationRow>(
    `SELECT ui_language, name, meaning, description
     FROM public.sign_localizations WHERE lexicon_id = $1 ORDER BY ui_language`,
    [sign.lexiconId]
  );
  return { ...sign, localizations: locs.rows.map(toLocalization) };
};

const UPSERT_LOCALIZATION = `
  INSERT INTO public.sign_localizations (lexicon_id, ui_language, name, meaning, description)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (lexicon_id, ui_language)
  DO UPDATE SET name = EXCLUDED.name, meaning = EXCLUDED.meaning,
                description = EXCLUDED.description, updated_at = NOW()
  RETURNING ui_language, name, meaning, description`;

// Columnas editables: nombre en la API -> columna en la tabla.
const EDITABLE: Record<keyof SignChanges, string> = {
  type: 'type',
  letter: 'letter',
  language: 'language',
  categoryId: 'category_id',
  animated: 'is_animated',
  displayOrder: 'display_order',
};

/** Si el ROLLBACK falla, la conexion queda en mal estado: se devuelve el error para destruirla en release(). */
const rollback = async (client: PoolClient): Promise<Error | undefined> => {
  try {
    await client.query('ROLLBACK');
    return undefined;
  } catch (error) {
    return error as Error;
  }
};

const isUniqueViolation = (error: unknown, constraint: string): boolean => {
  const e = error as { code?: string; constraint?: string };
  return e.code === '23505' && e.constraint === constraint;
};

export const makePostgresLexiconRepository = (pool: Pool): LexiconRepository => {
  const findByCode: LexiconRepository['findByCode'] = (code, options) => findSignByCode(pool, code, options);

  return {
  list: async ({ type, language, category, q, status, limit, offset, lang, includeInactive }) => {
    const { rows } = await pool.query<SignRow>(
      `${SELECT_SIGN}
       WHERE ($2::varchar IS NULL OR s.type = $2)
         AND ($3::varchar IS NULL OR s.language = $3)
         AND ($4::varchar IS NULL OR lower(c.name) = lower($4))
         AND ($5::varchar IS NULL OR ${RELEVANCE} < 3)
         AND ($6::boolean OR s.status = 'ACTIVE')
         AND ($7::varchar IS NULL OR s.status = $7)
       ORDER BY
         CASE WHEN $5::varchar IS NULL THEN 0 ELSE ${RELEVANCE} END,
         CASE WHEN $5::varchar IS NULL THEN s.display_order ELSE 0 END,
         lower(COALESCE(l.name, s.code)), s.lexicon_id
       LIMIT $8::int OFFSET COALESCE($9::int, 0)`,
      [lang, type ?? null, language ?? null, category ?? null, q ?? null, includeInactive ?? false, status ?? null, limit ?? null, offset ?? null]
    );
    return rows.map(toSign);
  },

  findByCode,

  create: async (sign, userId) => {
    const client = await pool.connect();
    let releaseError: Error | undefined;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ lexicon_id: number }>(
        `INSERT INTO public.sign_lexicon
           (code, type, letter, language, category_id, is_animated, display_order, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $8)
         RETURNING lexicon_id`,
        [sign.code, sign.type, sign.letter, sign.language, sign.categoryId, sign.animated, sign.displayOrder, userId]
      );
      for (const l of sign.localizations) {
        await client.query(UPSERT_LOCALIZATION, [rows[0].lexicon_id, l.uiLanguage, l.name, l.meaning, l.description]);
      }
      await client.query('COMMIT');
    } catch (error) {
      releaseError = await rollback(client);
      if (isUniqueViolation(error, 'uq_sign_lexicon_code')) throw new CodeTakenError(sign.code);
      if (isUniqueViolation(error, 'uq_sign_lexicon_letter')) throw new LetterTakenError();
      throw error;
    } finally {
      client.release(releaseError);
    }
    return (await findByCode(sign.code, { includeInactive: true })) as Sign;
  },

  update: async (code, changes, userId, localization) => {
    const sets: string[] = [];
    const values: unknown[] = [];
    (Object.keys(changes) as (keyof SignChanges)[]).forEach(key => {
      if (changes[key] === undefined || !EDITABLE[key]) return;
      values.push(changes[key]);
      sets.push(`${EDITABLE[key]} = $${values.length}`);
    });
    values.push(userId);
    sets.push(`updated_by = $${values.length}`, 'updated_at = NOW()');
    values.push(code);

    // Seña y localizacion ES se guardan juntas o no se guarda nada.
    const client = await pool.connect();
    let releaseError: Error | undefined;
    let found: boolean;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ lexicon_id: number }>(
        `UPDATE public.sign_lexicon SET ${sets.join(', ')} WHERE code = $${values.length} RETURNING lexicon_id`,
        values
      );
      found = rows.length > 0;
      if (found && localization) {
        await client.query(UPSERT_LOCALIZATION, [
          rows[0].lexicon_id, localization.uiLanguage, localization.name, localization.meaning, localization.description,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      releaseError = await rollback(client);
      if (isUniqueViolation(error, 'uq_sign_lexicon_letter')) throw new LetterTakenError();
      throw error;
    } finally {
      client.release(releaseError);
    }
    return found ? findByCode(code, { includeInactive: true }) : null;
  },

  setStatus: async (code, status, userId) => {
    const { rowCount } = await pool.query(
      `UPDATE public.sign_lexicon SET status = $1, updated_by = $2, updated_at = NOW() WHERE code = $3`,
      [status, userId, code]
    );
    return rowCount ? findByCode(code, { includeInactive: true }) : null;
  },

  upsertLocalization: async (code, l) => {
    const { rows } = await pool.query<LocalizationRow>(
      `WITH target AS (SELECT lexicon_id FROM public.sign_lexicon WHERE code = $1)
       INSERT INTO public.sign_localizations (lexicon_id, ui_language, name, meaning, description)
       SELECT lexicon_id, $2, $3, $4, $5 FROM target
       ON CONFLICT (lexicon_id, ui_language)
       DO UPDATE SET name = EXCLUDED.name, meaning = EXCLUDED.meaning,
                     description = EXCLUDED.description, updated_at = NOW()
       RETURNING ui_language, name, meaning, description`,
      [code, l.uiLanguage, l.name, l.meaning, l.description]
    );
    return rows[0] ? toLocalization(rows[0]) : null;
  },

  hasResourceAt: async (code, displayOrder) => {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM public.multimedia_resource r
       JOIN public.sign_lexicon s ON s.lexicon_id = r.lexicon_id
       WHERE s.code = $1 AND r.display_order = $2`,
      [code, displayOrder]
    );
    return (rowCount ?? 0) > 0;
  },

  addResource: async (code, resource: NewResource) => {
    try {
      const { rows } = await pool.query<ResourceRow>(
        `INSERT INTO public.multimedia_resource (lexicon_id, type, url, mime_type, display_order, description)
         SELECT s.lexicon_id, $2, $3, $4,
                COALESCE($5, (SELECT COALESCE(MAX(display_order), 0) + 1
                              FROM public.multimedia_resource WHERE lexicon_id = s.lexicon_id)),
                $6
         FROM public.sign_lexicon s WHERE s.code = $1
         RETURNING resource_id, type, url, mime_type, display_order, description`,
        [code, resource.type, resource.url, resource.mimeType ?? null, resource.displayOrder ?? null, resource.description ?? null]
      );
      return rows[0] ? toResource(rows[0]) : null;
    } catch (error) {
      if (isUniqueViolation(error, 'uq_multimedia_resource_position')) {
        throw new PositionTakenError(resource.displayOrder ?? undefined);
      }
      throw error;
    }
  },

  removeResource: async (code, resourceId) => {
    const { rowCount } = await pool.query(
      `DELETE FROM public.multimedia_resource r
       USING public.sign_lexicon s
       WHERE r.lexicon_id = s.lexicon_id AND s.code = $1 AND r.resource_id = $2`,
      [code, resourceId]
    );
    return (rowCount ?? 0) > 0;
  },
  };
};
