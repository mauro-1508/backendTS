import { AdminRecipientRepository, ReportRunQuery, ReportRunRepository } from '../../../ports/repositories';
import { Queryable } from './postgres_repositories';

/** Evita escribir en cada peticion de un admin: solo refresca si lleva mas de esto sin verse. */
const TOUCH_INTERVAL = '1 hour';

/** Perfiles vigentes con el interruptor de notificaciones encendido. */
const ENABLED_RECIPIENTS = `SELECT p.user_id, COALESCE(f.ui_language, 'ES') AS ui_language
    FROM user_profiles p
    LEFT JOIN user_preferences f ON f.user_id = p.user_id
   WHERE COALESCE(f.notifications_enabled, TRUE)
     AND NOT EXISTS (SELECT 1 FROM erased_users e WHERE e.user_id = p.user_id)`;

const toRecipient = (row: Record<string, any>) => ({ userId: row.user_id, uiLanguage: row.ui_language });

export const makePostgresAdminRecipientRepository = (db: Queryable): AdminRecipientRepository => ({
  async touch(userId, isAdmin) {
    if (!isAdmin) {
      await db.query('DELETE FROM admin_recipients WHERE user_id = $1', [userId]);
      return;
    }
    await db.query(
      `INSERT INTO admin_recipients (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now()
         WHERE admin_recipients.last_seen_at < now() - interval '${TOUCH_INTERVAL}'`,
      [userId],
    );
  },

  async listActive() {
    const { rows } = await db.query(
      `${ENABLED_RECIPIENTS} AND p.user_id IN (SELECT user_id FROM admin_recipients) ORDER BY p.user_id`,
    );
    return rows.map(toRecipient);
  },

  async listEnabled(userIds) {
    if (userIds.length === 0) return [];
    const { rows } = await db.query(
      `${ENABLED_RECIPIENTS} AND p.user_id = ANY($1::varchar[]) ORDER BY p.user_id`,
      [userIds],
    );
    return rows.map(toRecipient);
  },
});

export const makePostgresReportRunRepository = (db: Queryable): ReportRunRepository => ({
  async claim(kind, periodKey) {
    const { rows } = await db.query(
      `INSERT INTO admin_report_runs (kind, period_key) VALUES ($1, $2)
       ON CONFLICT (kind, period_key) DO NOTHING RETURNING run_id`,
      [kind, periodKey],
    );
    return rows[0]?.run_id ?? null;
  },
});

export const makePostgresReportRunQuery = (db: Queryable): ReportRunQuery => ({
  async isClaimed(kind, periodKey) {
    const { rows } = await db.query(
      'SELECT 1 FROM admin_report_runs WHERE kind = $1 AND period_key = $2',
      [kind, periodKey],
    );
    return rows.length > 0;
  },
});
