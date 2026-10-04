import { AuthRepository } from '../../../ports/outbound/auth_repository';
import { PasswordResetToken } from '../../../domain/entity';
import { Pool } from 'pg';

interface ResetTokenRow {
  token_id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  attempts: number;
}

const toResetToken = (row: ResetTokenRow): PasswordResetToken => ({
  tokenId: row.token_id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
  attempts: row.attempts,
});

export const makePostgresAuthRepository = (pool: Pool): AuthRepository => ({
  createResetToken: async ({ userId, tokenHash, expiresAt }) => {
    const { rows } = await pool.query<{ token_id: number }>(
      `INSERT INTO public.password_reset_token (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING token_id`,
      [userId, tokenHash, expiresAt]
    );
    return { tokenId: rows[0].token_id };
  },

  findActiveResetToken: async (userId: number) => {
    const { rows } = await pool.query<ResetTokenRow>(
      `SELECT token_id, user_id, token_hash, expires_at, used_at, attempts
       FROM public.password_reset_token
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY token_id DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0] ? toResetToken(rows[0]) : null;
  },

  registerFailedAttempt: async (tokenId: number) => {
    await pool.query(`UPDATE public.password_reset_token SET attempts = attempts + 1 WHERE token_id = $1`, [tokenId]);
  },

  invalidateResetTokens: async (userId: number) => {
    await pool.query(
      `UPDATE public.password_reset_token SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
  },

  markTokenAsUsed: async (tokenId: number) => {
    await pool.query(`UPDATE public.password_reset_token SET used_at = NOW() WHERE token_id = $1`, [tokenId]);
  },
});
