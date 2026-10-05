import { IamRepository } from '../../../ports/outbound/iam_repository';
import { Role } from '../../../domain/entity';
import { iamDomainService, RoleInUseError } from '../../../domain/service';
import { translateAssignRoleFkError } from './iam_fk_error';
import { pool } from '../../../../../shared/database/postgres';

interface RoleRow {
  role_id: number;
  name: string;
  description: string | null;
  permissions: string[];
}

const toRole = (row: RoleRow): Role => ({
  roleId: row.role_id,
  name: row.name,
  description: row.description,
  permissions: row.permissions,
});

const ROLE_SELECT = `
  SELECT r.role_id, r.name, r.description,
         COALESCE(array_agg(p.name ORDER BY p.name) FILTER (WHERE p.name IS NOT NULL), ARRAY[]::text[]) AS permissions
  FROM public.roles r
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.role_id
  LEFT JOIN public.permissions p ON p.permission_id = rp.permission_id`;

const isFkViolation = (e: unknown) => (e as { code?: string })?.code === '23503';

export const postgresIamRepository: IamRepository = {
  findRoleByName: async (name) => {
    const { rows } = await pool.query<RoleRow>(`${ROLE_SELECT} WHERE r.name = $1 GROUP BY r.role_id`, [name]);
    return rows[0] ? toRole(rows[0]) : null;
  },

  findRoleById: async (roleId) => {
    const { rows } = await pool.query<RoleRow>(`${ROLE_SELECT} WHERE r.role_id = $1 GROUP BY r.role_id`, [roleId]);
    return rows[0] ? toRole(rows[0]) : null;
  },

  listRoles: async () => {
    const { rows } = await pool.query<RoleRow>(`${ROLE_SELECT} GROUP BY r.role_id ORDER BY r.role_id`);
    return rows.map(toRole);
  },

  listRolesForUser: async (userId) => {
    const { rows } = await pool.query<RoleRow>(
      `${ROLE_SELECT}
       JOIN public.user_roles ur ON ur.role_id = r.role_id
       WHERE ur.user_id = $1
       GROUP BY r.role_id ORDER BY r.role_id`,
      [userId]
    );
    return rows.map(toRole);
  },

  listPermissionsForUser: async (userId) => {
    const { rows } = await pool.query<{ name: string }>(
      `SELECT DISTINCT p.name
       FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role_id = ur.role_id
       JOIN public.permissions p ON p.permission_id = rp.permission_id
       WHERE ur.user_id = $1
       ORDER BY p.name`,
      [userId]
    );
    return rows.map((row) => row.name);
  },

  userExists: async (userId) => {
    const { rowCount } = await pool.query('SELECT 1 FROM public.users WHERE user_id = $1', [userId]);
    return (rowCount ?? 0) > 0;
  },

  assignRole: async ({ userId, roleId }) => {
    try {
      await pool.query(
        `INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, roleId]
      );
    } catch (error) {
      // Carrera con el borrado del usuario o del rol entre la validacion y el INSERT.
      throw translateAssignRoleFkError(error) ?? error;
    }
  },

  revokeRoleGuarded: async ({ userId, roleId, isAdminRole }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Bloquea las filas de ADMIN y las del usuario: revocaciones concurrentes se serializan.
      const { rows } = await client.query<{ user_id: number; role_id: number; name: string }>(
        `SELECT ur.user_id, ur.role_id, r.name
         FROM public.user_roles ur JOIN public.roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = $1 OR r.name = 'ADMIN'
         ORDER BY ur.user_id, ur.role_id
         FOR UPDATE OF ur`,
        [userId]
      );
      const outcome = iamDomainService.decideRevoke({
        hasRole: rows.some((r) => r.user_id === userId && r.role_id === roleId),
        isAdminRole,
        adminCount: rows.filter((r) => r.name === 'ADMIN').length,
        userRoleCount: rows.filter((r) => r.user_id === userId).length,
      });
      if (outcome === 'revoked') {
        await client.query('DELETE FROM public.user_roles WHERE user_id = $1 AND role_id = $2', [userId, roleId]);
      }
      await client.query('COMMIT');
      return outcome;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  isLastAdmin: async (userId) => {
    const { rows } = await pool.query<{ user_id: number }>(
      `SELECT ur.user_id FROM public.user_roles ur JOIN public.roles r ON r.role_id = ur.role_id WHERE r.name = 'ADMIN'`
    );
    return rows.length === 1 && rows[0].user_id === userId;
  },

  countUsersWithRole: async (roleId) => {
    const { rows } = await pool.query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM public.user_roles WHERE role_id = $1',
      [roleId]
    );
    return Number(rows[0].total);
  },

  deleteRole: async (roleId) => {
    try {
      await pool.query('DELETE FROM public.roles WHERE role_id = $1', [roleId]);
    } catch (error) {
      if (isFkViolation(error)) throw new RoleInUseError('El rol esta asignado a usuarios');
      throw error;
    }
  },
};
