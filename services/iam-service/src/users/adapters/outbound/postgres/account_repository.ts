import { AccountRepository } from '../../../ports/outbound/account_repository';
import { Pool } from 'pg';

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ user_id?: number }> }>;

// Ejecuta fn dentro de una transaccion: COMMIT si termina, ROLLBACK si lanza o si fn pide abortar.
const inTransaction = async <T>(pool: Pool, fn: (q: Query) => Promise<{ value: T; commit: boolean }>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { value, commit } = await fn((sql, params) => client.query(sql, params));
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const makePostgresAccountRepository = (pool: Pool): AccountRepository => ({
  changePassword: (userId, hashedPassword) =>
    inTransaction(pool, async (q) => {
      await q('SELECT 1 FROM public.users WHERE user_id = $1 FOR UPDATE', [userId]);
      await q('UPDATE public.users SET password = $1 WHERE user_id = $2', [hashedPassword, userId]);
      // Un codigo de recuperacion pedido antes del cambio no debe poder pisar la clave nueva.
      await q(
        `UPDATE public.user_tokens SET revoked_at = NOW()
         WHERE user_id = $1 AND token_type = 'PASSWORD_RESET' AND used_at IS NULL AND revoked_at IS NULL`,
        [userId]
      );
      return { value: undefined, commit: true };
    }),

  erase: (userId) =>
    inTransaction(pool, async (q) => {
      // Mismo orden de bloqueo que auth (users primero); luego los ADMIN, como revokeRoleGuarded.
      const locked = await q('SELECT 1 FROM public.users WHERE user_id = $1 FOR UPDATE', [userId]);
      if (!locked.rows.length) return { value: 'not_found' as const, commit: false };

      const admins = await q(
        `SELECT ur.user_id FROM public.user_roles ur JOIN public.roles r ON r.role_id = ur.role_id
         WHERE r.name = 'ADMIN' ORDER BY ur.user_id FOR UPDATE OF ur`
      );
      const isAdmin = admins.rows.some((r) => r.user_id === userId);
      if (isAdmin && admins.rows.length <= 1) return { value: 'last_admin' as const, commit: false };

      await q('DELETE FROM public.translations WHERE user_id = $1', [userId]);
      await q('DELETE FROM public.user_tokens WHERE user_id = $1', [userId]);
      await q('DELETE FROM public.user_roles WHERE user_id = $1', [userId]);
      // Los hechos de uso sobreviven a la persona (HU-USG-004): se desligan, no se borran.
      await q(
        `UPDATE public.usage_events SET reference_type = NULL, reference_id = NULL WHERE reference_type = 'USER' AND reference_id = $1`,
        [userId]
      );
      await q('UPDATE public.usage_events SET user_id = NULL WHERE user_id = $1', [userId]);
      await q('DELETE FROM public.users WHERE user_id = $1', [userId]);
      return { value: 'erased' as const, commit: true };
    }),
});
