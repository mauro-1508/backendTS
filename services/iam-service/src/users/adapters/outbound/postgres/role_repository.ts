import { Pool } from 'pg';
import { RoleRepository } from '../../../ports/outbound/role_repository';

const roleExists = async (pool: Pool, roleName: string): Promise<boolean> => {
  const { rowCount } = await pool.query('SELECT 1 FROM public.role WHERE name = $1 LIMIT 1', [roleName]);
  return rowCount !== 0;
};

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

  assignRole: async (userId: number, roleName: string) => {
    const { rowCount } = await pool.query(
      `INSERT INTO public.user_role (user_id, role_id)
       SELECT $1, role_id FROM public.role WHERE name = $2
       ON CONFLICT DO NOTHING`,
      [userId, roleName]
    );
    if (rowCount === 0 && !(await roleExists(pool, roleName))) {
      throw new Error(`El rol ${roleName} no existe en la base de iam`);
    }
  },
});
