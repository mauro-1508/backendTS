import { Pool, PoolClient } from 'pg';
import { AccountErasedError } from '../common/domain/errors';

/** No cambia la retención: solo impide nuevas escrituras con un operador eliminado. */
export const withActiveAccount = async <T>(
  pool: Pool, userId: number | null, work: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (userId !== null) {
      // Misma clave que crear/borrar traducciones; abarca también la escritura Mongo.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('erased_user'), $1::int)", [userId]);
      const erased = await client.query('SELECT 1 FROM public.erased_users WHERE user_id = $1', [userId]);
      if (erased.rows.length) throw new AccountErasedError();
    }
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
