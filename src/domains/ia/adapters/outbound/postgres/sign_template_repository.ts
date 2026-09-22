import { pool } from '../../../../../shared/database/postgres';
import { SignTemplateRepository } from '../../../ports/outbound/sign_template_repository';
import { NewSignTemplate, SignTemplate, TemplateKind } from '../../../domain/entity';

interface SignTemplateRow {
  template_id: number;
  label: string;
  kind: TemplateKind;
  features: number[][];
  source: string;
  created_by: number | null;
  created_at: Date;
}

const toTemplate = (row: SignTemplateRow): SignTemplate => ({
  templateId: row.template_id,
  label: row.label,
  kind: row.kind,
  features: row.features,
  source: row.source,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

const RETURNING = 'template_id, label, kind, features, source, created_by, created_at';

export const postgresSignTemplateRepository: SignTemplateRepository = {
  createMany: async (templates: NewSignTemplate[], createdBy: number | null) => {
    // Una sola sentencia con UNNEST: los lotes del dataset son de cientos de filas.
    const { rows } = await pool.query<SignTemplateRow>(
      `INSERT INTO public.sign_templates (label, kind, features, source, created_by)
       SELECT t.label, t.kind, t.features, t.source, $5::int
       FROM UNNEST($1::varchar[], $2::varchar[], $3::jsonb[], $4::varchar[])
            AS t(label, kind, features, source)
       RETURNING ${RETURNING}`,
      [
        templates.map(t => t.label.trim()),
        templates.map(t => t.kind),
        templates.map(t => JSON.stringify(t.features)),
        templates.map(t => t.source ?? 'manual'),
        createdBy,
      ]
    );
    return rows.map(toTemplate);
  },

  list: async ({ kind, label }) => {
    const { rows } = await pool.query<SignTemplateRow>(
      `SELECT ${RETURNING}
       FROM public.sign_templates
       WHERE ($1::varchar IS NULL OR kind = $1)
         AND ($2::varchar IS NULL OR label = $2)
       ORDER BY label, template_id`,
      [kind ?? null, label ?? null]
    );
    return rows.map(toTemplate);
  },

  remove: async (templateId: number) => {
    const { rows } = await pool.query<{ template_id: number }>(
      `DELETE FROM public.sign_templates WHERE template_id = $1 RETURNING template_id`,
      [templateId]
    );
    return rows[0] ? { templateId: rows[0].template_id } : null;
  },
};
