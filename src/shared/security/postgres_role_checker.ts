import { pool } from '../database/postgres';
import { RoleChecker } from './role_checker';

/** 42P01 = undefined_table: la migracion de roles no se ha aplicado. */
const UNDEFINED_TABLE = '42P01';

export const postgresRoleChecker: RoleChecker = {
  hasRole: async (userId, roleName) => {
    try {
      const { rowCount } = await pool.query(
        `SELECT 1
         FROM public.user_role ur
         JOIN public.role r ON r.role_id = ur.role_id
         WHERE ur.user_id = $1 AND r.name = $2`,
        [userId, roleName]
      );
      return (rowCount ?? 0) > 0;
    } catch (error) {
      if ((error as { code?: string }).code === UNDEFINED_TABLE) {
        console.error(
          '[roles] Falta la tabla public.user_role o public.role: aplica la migracion de roles antes de usar rutas de ADMIN.',
          error,
        );
      }
      throw error;
    }
  },
};
