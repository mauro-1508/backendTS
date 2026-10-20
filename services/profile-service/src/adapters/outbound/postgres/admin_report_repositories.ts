import { AdminRecipientRepository, ReportRunQuery, ReportRunRepository } from '../../../ports/repositories';
import { Queryable } from './postgres_repositories';

/** Evita escribir en cada peticion de un admin: solo refresca si lleva mas de esto sin verse. */
const TOUCH_INTERVAL = '1 hour';

/** Un admin que no se ve desde hace mas de esto deja de recibir avisos. */
const ACTIVE_ADMIN_WINDOW = '30 days';

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
      `SELECT a.user_id, COALESCE(f.ui_language, 'ES') AS ui_language
         FROM admin_recipients a
         JOIN user_profiles p ON p.user_id = a.user_id
         LEFT JOIN user_preferences f ON f.user_id = a.user_id
        WHERE COALESCE(f.notifications_enabled, TRUE)
          AND a.last_seen_at > now() - interval '${ACTIVE_ADMIN_WINDOW}'
          AND NOT EXISTS (SELECT 1 FROM erased_users e WHERE e.user_id = a.user_id)
        ORDER BY a.user_id`,
    );
    return rows.map(row => ({ userId: row.user_id, uiLanguage: row.ui_language }));
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
