import { Pool } from 'pg';
import { RoleRepository } from '../../../ports/outbound/role_repository';

export const makePostgresRoleRepository = (pool: Pool): RoleRepository => ({
  findRoleNamesByUserId: async (userId: number) => {
    const { rows } = await pool.query<{ name: string }>(
      `SELECT r.name
       FROM public.user_role ur
       JOIN public.role r ON r.role_id = ur.role_id
       WHERE ur.user_id = $1 AND r.name IS NOT NULL
       ORDER BY r.name`,
      [userId]
    );
    return rows.map(row => row.name);
  },
});
