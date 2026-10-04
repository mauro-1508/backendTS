import { pool } from '../../../../../shared/database/postgres';
import { Category, CategorySummary } from '../../../domain/entity';
import { CategoryRepository } from '../../../domain/repository';
import { CategoryInUseError, CategoryNameTakenError } from '../../../domain/rules';

interface CategoryRow {
  category_id: number;
  name: string;
  description: string | null;
  sign_count?: number;
}

const isNameTaken = (error: unknown) => {
  const e = error as { code?: string; constraint?: string };
  return e.code === '23505' && e.constraint === 'uq_categories_name';
};

const toCategory = (row: CategoryRow): Category => ({
  categoryId: row.category_id,
  name: row.name,
  description: row.description,
});

export const postgresCategoryRepository: CategoryRepository = {
  list: async () => {
    const { rows } = await pool.query<CategoryRow>(
      `SELECT c.category_id, c.name, c.description,
              COUNT(s.lexicon_id) FILTER (WHERE s.status = 'ACTIVE')::int AS sign_count
       FROM public.categories c
       LEFT JOIN public.sign_lexicon s ON s.category_id = c.category_id
       GROUP BY c.category_id
       ORDER BY lower(c.name)`
    );
    return rows.map((r): CategorySummary => ({ ...toCategory(r), signCount: r.sign_count ?? 0 }));
  },

  findById: async categoryId => {
    const { rows } = await pool.query<CategoryRow>(
      'SELECT category_id, name, description FROM public.categories WHERE category_id = $1',
      [categoryId]
    );
    return rows[0] ? toCategory(rows[0]) : null;
  },

  findByName: async name => {
    const { rows } = await pool.query<CategoryRow>(
      'SELECT category_id, name, description FROM public.categories WHERE lower(name) = lower($1)',
      [name]
    );
    return rows[0] ? toCategory(rows[0]) : null;
  },

  create: async ({ name, description }) => {
    try {
      const { rows } = await pool.query<CategoryRow>(
        `INSERT INTO public.categories (name, description) VALUES ($1, $2)
         RETURNING category_id, name, description`,
        [name, description]
      );
      return toCategory(rows[0]);
    } catch (error) {
      if (isNameTaken(error)) throw new CategoryNameTakenError(name);
      throw error;
    }
  },

  update: async (categoryId, changes) => {
    try {
      const { rows } = await pool.query<CategoryRow>(
        `UPDATE public.categories
         SET name = COALESCE($2, name),
             description = CASE WHEN $3::boolean THEN $4 ELSE description END
         WHERE category_id = $1
         RETURNING category_id, name, description`,
        [categoryId, changes.name ?? null, changes.description !== undefined, changes.description ?? null]
      );
      return rows[0] ? toCategory(rows[0]) : null;
    } catch (error) {
      if (isNameTaken(error)) throw new CategoryNameTakenError(changes.name ?? '');
      throw error;
    }
  },

  countSigns: async categoryId => {
    const { rows } = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM public.sign_lexicon WHERE category_id = $1',
      [categoryId]
    );
    return rows[0].total;
  },

  delete: async categoryId => {
    try {
      const { rowCount } = await pool.query('DELETE FROM public.categories WHERE category_id = $1', [categoryId]);
      return (rowCount ?? 0) > 0;
    } catch (error) {
      // 23503: ON DELETE RESTRICT, alguien le asigno una seña entre la comprobacion y el borrado.
      if ((error as { code?: string }).code === '23503') throw new CategoryInUseError();
      throw error;
    }
  },
};
