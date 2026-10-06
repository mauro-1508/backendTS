import { AuthRepository } from '../../../ports/outbound/auth_repository';
import { UserToken, UserTokenType } from '../../../domain/entity';
import { Pool } from 'pg';

interface TokenRow {
  token_id: number;
  user_id: number;
  token_type: UserTokenType;
  token_hash: string;
  attempts: number;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

const toToken = (row: TokenRow): UserToken => ({
  tokenId: row.token_id,
  userId: row.user_id,
  tokenType: row.token_type,
  tokenHash: row.token_hash,
  attempts: row.attempts,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
  revokedAt: row.revoked_at,
  createdAt: row.created_at,
});

// Ejecuta `work` en una transaccion; siempre libera la conexion (y la descarta si el ROLLBACK falla).
const inTransaction = async <T>(pool: Pool, work: (client: import('pg').PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  let releaseError: Error | undefined;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      releaseError = rollbackError as Error;
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
};

export const makePostgresAuthRepository = (pool: Pool): AuthRepository => ({
  issueTokenIfAllowed: ({ userId, type, hashToken, expiresAt, now, decide }) =>
    inTransaction(pool, async (client) => {
      // Bloqueo por usuario: serializa emisiones concurrentes (cooldown y tope no se saltan en paralelo).
      await client.query(`SELECT 1 FROM public.users WHERE user_id = $1 FOR UPDATE`, [userId]);
      const { rows } = await client.query<{ last: Date | null; sent: string }>(
        `SELECT MAX(created_at) AS last,
                COUNT(*) FILTER (WHERE created_at >= $3::timestamptz - INTERVAL '1 hour') AS sent
         FROM public.user_tokens WHERE user_id = $1 AND token_type = $2`,
        [userId, type, now]
      );
      const decision = decide(rows[0].last, Number(rows[0].sent));
      if (decision !== 'ok') return decision;
      const tokenHash = await hashToken();

      await client.query(
        `UPDATE public.user_tokens SET revoked_at = $3
         WHERE user_id = $1 AND token_type = $2 AND used_at IS NULL AND revoked_at IS NULL`,
        [userId, type, now]
      );
      await client.query(
        `INSERT INTO public.user_tokens (user_id, token_type, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, type, tokenHash, expiresAt, now]
      );
      return 'issued' as const;
    }),

  // Un solo UPDATE atomico: el WHERE con `attempts < max` impide que peticiones paralelas superen el limite.
  reserveAttempt: async (userId, type, now, maxAttempts) => {
    const { rows } = await pool.query<TokenRow>(
      `UPDATE public.user_tokens SET attempts = attempts + 1
       WHERE user_id = $1 AND token_type = $2
         AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $3 AND attempts < $4
       RETURNING token_id, user_id, token_type, token_hash, attempts, expires_at, used_at, revoked_at, created_at`,
      [userId, type, now, maxAttempts]
    );
    return rows[0] ? toToken(rows[0]) : null;
  },

  releaseAttempt: async (tokenId) => {
    await pool.query(`UPDATE public.user_tokens SET attempts = GREATEST(attempts - 1, 0) WHERE token_id = $1`, [tokenId]);
  },

  consumeAndResetPassword: (tokenId, userId, passwordHash) =>
    inTransaction(pool, async (client) => {
      // Mismo orden de bloqueo que issueTokenIfAllowed: users -> user_tokens (evita interbloqueos).
      await client.query(`SELECT 1 FROM public.users WHERE user_id = $1 FOR UPDATE`, [userId]);
      const consumed = await client.query(
        `UPDATE public.user_tokens SET used_at = NOW() WHERE token_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [tokenId]
      );
      if (consumed.rowCount === 0) return false;
      // Un codigo de recuperacion valido prueba la propiedad del correo: una cuenta INACTIVE queda ACTIVE y
      // verificada (los SET usan los valores previos de la fila, asi que los CASE ven el status original).
      await client.query(
        `UPDATE public.users SET password = $1,
           status = CASE WHEN status = 'INACTIVE' THEN 'ACTIVE' ELSE status END,
           email_verified_at = CASE WHEN status = 'INACTIVE' THEN NOW() ELSE email_verified_at END
         WHERE user_id = $2`,
        [passwordHash, userId]
      );
      // Los codigos de verificacion vivos ya no sirven.
      await client.query(
        `UPDATE public.user_tokens SET revoked_at = NOW()
         WHERE user_id = $1 AND token_type = 'EMAIL_VERIFICATION' AND used_at IS NULL AND revoked_at IS NULL`,
        [userId]
      );
      return true;
    }),

  consumeAndActivate: (tokenId, userId) =>
    inTransaction(pool, async (client) => {
      // Mismo orden de bloqueo: users -> user_tokens.
      await client.query(`SELECT 1 FROM public.users WHERE user_id = $1 FOR UPDATE`, [userId]);
      const consumed = await client.query(
        `UPDATE public.user_tokens SET used_at = NOW()
         WHERE token_id = $1 AND used_at IS NULL AND revoked_at IS NULL RETURNING token_id`,
        [tokenId]
      );
      if (consumed.rowCount === 0) return false;
      // Solo INACTIVE -> ACTIVE: una cuenta BLOCKED no se reactiva verificando el correo.
      const activated = await client.query(
        `UPDATE public.users SET status = 'ACTIVE', email_verified_at = NOW() WHERE user_id = $1 AND status = 'INACTIVE'`,
        [userId]
      );
      return activated.rowCount === 1;
    }),
});
