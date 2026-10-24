import { Pool, PoolClient } from 'pg';
import { EmailOutbox } from '../../../ports/repositories';

/**
 * La transaccion queda abierta mientras se envia el lote: SKIP LOCKED evita que dos instancias
 * manden el mismo correo. Si el proceso cae tras enviar y antes del COMMIT, el correo se reenvia.
 */
export const makePostgresEmailOutbox = (pool: Pool): EmailOutbox => ({
  async processDue(limit, deliver) {
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const { rows } = await client.query(
        `SELECT n.notification_id, n.title, n.body, p.email,
                COALESCE(f.ui_language, 'ES') AS ui_language,
                COALESCE(f.notifications_enabled, TRUE) AS notifications_enabled
           FROM notifications n
           LEFT JOIN user_profiles p ON p.user_id = n.user_id
           LEFT JOIN user_preferences f ON f.user_id = n.user_id
          WHERE n.channel = 'EMAIL' AND n.status = 'PENDING'
            AND COALESCE(n.scheduled_at, n.created_at) <= now()
          ORDER BY COALESCE(n.scheduled_at, n.created_at)
          LIMIT $1
          FOR UPDATE OF n SKIP LOCKED`,
        [limit],
      );
      for (const row of rows) {
        const outcome = await deliver({
          notificationId: row.notification_id,
          to: row.email ?? undefined,
          title: row.title,
          body: row.body,
          language: row.ui_language,
          notificationsEnabled: row.notifications_enabled,
        });
        await client.query(
          `UPDATE notifications
              SET status = $2::varchar, sent_at = CASE WHEN $2::varchar = 'SENT' THEN clock_timestamp() END
            WHERE notification_id = $1`,
          [row.notification_id, outcome],
        );
      }
      await client.query('COMMIT');
      return rows.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
});
