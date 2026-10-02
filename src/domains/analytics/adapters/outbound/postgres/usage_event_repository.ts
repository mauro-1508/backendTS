import { UsageEventRepository } from '../../../ports/outbound/usage_event_repository';
import { SectionReportRow } from '../../../domain/entity';
import { pool } from '../../../../../shared/database/postgres';

export const postgresUsageEventRepository: UsageEventRepository = {
  append: async (e) => {
    await pool.query(
      `INSERT INTO public.usage_events (user_id, session_id, section, event_type, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [e.userId, e.sessionId, e.section, e.eventType, e.referenceType, e.referenceId],
    );
  },

  countSectionViews: async ({ from, to }) => {
    const { rows } = await pool.query<SectionReportRow>(
      `SELECT section, COUNT(*)::int AS visits
       FROM public.usage_events
       WHERE event_type = 'SECTION_VIEW' AND created_at >= $1 AND created_at < $2
       GROUP BY section
       ORDER BY visits DESC, section ASC`,
      [from, to],
    );
    return rows;
  },
};
