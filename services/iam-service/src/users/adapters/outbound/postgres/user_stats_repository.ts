import { UserStatsRepository } from '../../../ports/outbound/user_stats_repository';
import { Pool } from 'pg';

export const makePostgresUserStatsRepository = (pool: Pool): UserStatsRepository => ({
  getStats: async () => {
    const { rows } = await pool.query<{ total: number; active: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active
       FROM public.users`,
    );
    return { totalUsers: rows[0].total, activeAccounts: rows[0].active };
  },
});
