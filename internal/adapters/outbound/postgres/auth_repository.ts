import { AuthRepository } from '../../../ports/outbound/auth_repository';
import { PasswordResetToken } from '../../../domain/auth/entity';
import { pool } from './postgres';

interface ResetTokenRow {
  token_id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

const toResetToken = (row: ResetTokenRow): PasswordResetToken => ({
  tokenId: row.token_id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
});

export const postgresAuthRepository: AuthRepository = {
  createResetToken: async ({ userId, tokenHash, expiresAt }) => {
    const { rows } = await pool.query<{ token_id: number }>(
      `INSERT INTO public.password_reset_token (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING token_id`,
      [userId, tokenHash, expiresAt]
    );
    return { tokenId: rows[0].token_id };
  },

  findResetToken: async (tokenHash: string) => {
    const { rows } = await pool.query<ResetTokenRow>(
      `SELECT token_id, user_id, token_hash, expires_at, used_at
       FROM public.password_reset_token
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );
    return rows[0] ? toResetToken(rows[0]) : null;
  },

  markTokenAsUsed: async (tokenId: number) => {
    await pool.query(`UPDATE public.password_reset_token SET used_at = NOW() WHERE token_id = $1`, [tokenId]);
  },
};
