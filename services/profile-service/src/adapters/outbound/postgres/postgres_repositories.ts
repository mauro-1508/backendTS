import { Pool, PoolClient, QueryResultRow } from 'pg';
import { AchievementProgress } from '../../../domain/achievement';
import { Notification } from '../../../domain/notification';
import { Preferences, Profile } from '../../../domain/preferences';
import {
  AchievementRepository, NotificationRepository, ProcessedEventRepository, ProfileRepository,
  TransactionalRepositories, UnitOfWork,
} from '../../../ports/repositories';

/** Lo unico que los repositorios necesitan: Pool y PoolClient (transaccion) lo cumplen. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

const iso = (value: Date | null): string | undefined => value?.toISOString();

const PREFERENCES_COLUMNS = 'ui_language, theme, notifications_enabled, updated_at';

const toPreferences = (row: Record<string, any>): Preferences => ({
  uiLanguage: row.ui_language,
  theme: row.theme,
  notificationsEnabled: row.notifications_enabled,
  updatedAt: iso(row.updated_at),
});

const COLUMN_BY_PREFERENCE = {
  uiLanguage: 'ui_language',
  theme: 'theme',
  notificationsEnabled: 'notifications_enabled',
} as const;

export const makePostgresProfileRepository = (db: Queryable): ProfileRepository => ({
  async createIfAbsent({ userId, email, fullName, username }) {
    await db.query(
      `INSERT INTO user_profiles (user_id, email, full_name, username) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, email ?? null, fullName ?? null, username ?? null],
    );
    await db.query('INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  },

  async findProfile(userId): Promise<Profile | null> {
    const { rows } = await db.query(
      `SELECT p.user_id, p.email, p.full_name, p.username,
              COALESCE(f.ui_language, 'ES') AS ui_language, COALESCE(f.theme, 'LIGHT') AS theme,
              COALESCE(f.notifications_enabled, TRUE) AS notifications_enabled, f.updated_at
         FROM user_profiles p LEFT JOIN user_preferences f ON f.user_id = p.user_id
        WHERE p.user_id = $1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      fullName: row.full_name ?? '',
      username: row.username ?? undefined,
      email: row.email ?? undefined,
      preferences: toPreferences(row),
    };
  },

  async findPreferences(userId) {
    const { rows } = await db.query(`SELECT ${PREFERENCES_COLUMNS} FROM user_preferences WHERE user_id = $1`, [userId]);
    return rows[0] ? toPreferences(rows[0]) : null;
  },

  async updatePreferences(userId, patch) {
    const entries = Object.entries(patch) as Array<[keyof typeof COLUMN_BY_PREFERENCE, unknown]>;
    const assignments = entries.map(([field], index) => `${COLUMN_BY_PREFERENCE[field]} = $${index + 2}`);
    const { rows } = await db.query(
      `UPDATE user_preferences SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 RETURNING ${PREFERENCES_COLUMNS}`,
      [userId, ...entries.map(([, value]) => value)],
    );
    return rows[0] ? toPreferences(rows[0]) : null;
  },
});

const ACHIEVEMENT_PROGRESS_SELECT = `
  SELECT a.achievement_id, a.code, a.name, a.description, a.metric, a.target_count, a.points,
         a.icon_reference, a.is_secret, a.is_active,
         COALESCE(ua.current_count, 0) AS current_count, ua.achieved_at
    FROM achievements a
    LEFT JOIN user_achievements ua ON ua.achievement_id = a.achievement_id AND ua.user_id = $1
   WHERE a.is_active`;

const toProgress = (row: Record<string, any>): AchievementProgress => ({
  achievement: {
    id: row.achievement_id,
    code: row.code,
    name: row.name,
    description: row.description,
    metric: row.metric,
    targetCount: row.target_count,
    points: row.points,
    iconReference: row.icon_reference ?? undefined,
    isSecret: row.is_secret,
    isActive: row.is_active,
  },
  currentCount: row.current_count,
  achievedAt: iso(row.achieved_at) ?? null,
});

export const makePostgresAchievementRepository = (db: Queryable): AchievementRepository => ({
  async findProgressByMetric(userId, metric) {
    const { rows } = await db.query(`${ACHIEVEMENT_PROGRESS_SELECT} AND a.metric = $2 ORDER BY a.target_count`, [userId, metric]);
    return rows.map(toProgress);
  },

  async findAllProgress(userId) {
    const { rows } = await db.query(`${ACHIEVEMENT_PROGRESS_SELECT} ORDER BY a.metric, a.target_count`, [userId]);
    return rows.map(toProgress);
  },

  async saveProgress(userId, progress) {
    await db.query(
      `INSERT INTO user_achievements (user_id, achievement_id, current_count, achieved_at, notified_at)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (user_id, achievement_id) DO UPDATE
         SET current_count = EXCLUDED.current_count, achieved_at = EXCLUDED.achieved_at,
             notified_at = EXCLUDED.notified_at, updated_at = CURRENT_TIMESTAMP`,
      [userId, progress.achievement.id, progress.currentCount, progress.achievedAt],
    );
  },
});

const NOTIFICATION_COLUMNS = `notification_id, notification_type_id, channel, title, body, reference_type,
  reference_id, status, sent_at, read_at, created_at`;

const toNotification = (row: Record<string, any>): Notification => ({
  id: row.notification_id,
  typeId: row.notification_type_id,
  channel: row.channel,
  title: row.title,
  body: row.body,
  referenceType: row.reference_type ?? undefined,
  referenceId: row.reference_id ?? undefined,
  status: row.status,
  sentAt: iso(row.sent_at),
  readAt: iso(row.read_at),
  createdAt: row.created_at.toISOString(),
});

export const makePostgresNotificationRepository = (db: Queryable): NotificationRepository => ({
  async create(notification) {
    await db.query(
      `INSERT INTO notifications
         (user_id, notification_type_id, channel, title, body, reference_type, reference_id, status, sent_at)
       SELECT $1, notification_type_id, 'IN_APP', $3, $4, $5, $6, 'SENT', CURRENT_TIMESTAMP
         FROM notification_types WHERE code = $2 AND is_active`,
      [
        notification.userId, notification.typeCode, notification.title, notification.body,
        notification.referenceType ?? null, notification.referenceId ?? null,
      ],
    );
  },

  async list(userId, { page, limit, unreadOnly }) {
    const unreadFilter = unreadOnly ? 'AND read_at IS NULL' : '';
    const [items, counts] = await Promise.all([
      db.query(
        `SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE user_id = $1 ${unreadFilter}
          ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, (page - 1) * limit],
      ),
      db.query(
        `SELECT COUNT(*) FILTER (WHERE ${unreadOnly ? 'read_at IS NULL' : 'TRUE'}) AS total,
                COUNT(*) FILTER (WHERE read_at IS NULL) AS unread
           FROM notifications WHERE user_id = $1`,
        [userId],
      ),
    ]);
    return {
      items: items.rows.map(toNotification),
      total: Number(counts.rows[0].total),
      unreadCount: Number(counts.rows[0].unread),
    };
  },

  async markRead(userId, notificationId) {
    const { rows } = await db.query(
      `UPDATE notifications SET status = 'READ', read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE notification_id = $1 AND user_id = $2 RETURNING ${NOTIFICATION_COLUMNS}`,
      [notificationId, userId],
    );
    return rows[0] ? toNotification(rows[0]) : null;
  },
});

export const makePostgresProcessedEventRepository = (db: Queryable): ProcessedEventRepository => ({
  async markIfNew(eventId) {
    const result = await db.query(
      'INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING',
      [eventId],
    );
    return result.rowCount === 1;
  },
});

export const makePostgresRepositories = (db: Queryable): TransactionalRepositories => ({
  profiles: makePostgresProfileRepository(db),
  achievements: makePostgresAchievementRepository(db),
  notifications: makePostgresNotificationRepository(db),
  processedEvents: makePostgresProcessedEventRepository(db),
});

/** Cada `run` abre una transaccion: commit si termina bien, rollback si falla. */
export const makePostgresUnitOfWork = (pool: Pool): UnitOfWork => ({
  async run(work) {
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(makePostgresRepositories(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
});
