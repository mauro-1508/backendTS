import { Pool } from 'pg';
import { AdminDirectoryRepository } from '../../../ports/outbound/admin_directory_repository';

const ADMIN_ROLE = 'ADMIN';

export const makePostgresAdminDirectoryRepository = (pool: Pool): AdminDirectoryRepository => ({
  listActiveAdminIds: async () => {
    const { rows } = await pool.query<{ user_id: number }>(
      `SELECT DISTINCT u.user_id
       FROM public.users u
       JOIN public.user_roles ur ON ur.user_id = u.user_id
       JOIN public.roles r ON r.role_id = ur.role_id
       WHERE r.name = $1 AND u.status = 'ACTIVE'
       ORDER BY u.user_id`,
      [ADMIN_ROLE],
    );
    return rows.map(row => Number(row.user_id));
  },
});
