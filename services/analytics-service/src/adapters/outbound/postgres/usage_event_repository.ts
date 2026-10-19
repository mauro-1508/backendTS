import { Pool } from 'pg';
import { AccountErasedError } from '../../../domain/rules';
import { DailyUsage, DateRange, SectionVisits, TopSign, UsageEvent, UsageSummary } from '../../../domain/entity';
import { UsageEventRepository } from '../../../domain/repository';

const REPORT_TIME_ZONE = 'America/Bogota';
/** Dia calendario de Colombia al que pertenece el evento. */
const LOCAL_DAY = `(created_at AT TIME ZONE '${REPORT_TIME_ZONE}')::date`;
const IN_RANGE = `${LOCAL_DAY} BETWEEN $1::date AND $2::date`;

const INSERT_EVENT = `
  INSERT INTO usage_event
    (event_id, user_id, session_id, section, event_type, reference_type, reference_id, sign_codes, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (event_id) DO NOTHING`;

const SUMMARY = `
  SELECT
    count(*) FILTER (WHERE event_type = 'TRANSLATION_COMPLETED') AS translations,
    count(*) FILTER (WHERE event_type = 'USER_REGISTERED') AS new_users
  FROM usage_event WHERE ${IN_RANGE}`;

const TOP_SIGNS = `
  SELECT code AS sign_code, count(*) AS translations
  FROM usage_event, unnest(sign_codes) AS code
  WHERE event_type = 'TRANSLATION_COMPLETED' AND ${IN_RANGE}
  GROUP BY code
  ORDER BY translations DESC, sign_code
  LIMIT $3`;

const DAILY_SERIES = `
  SELECT
    to_char(${LOCAL_DAY}, 'YYYY-MM-DD') AS date,
    count(*) FILTER (WHERE event_type = 'TRANSLATION_COMPLETED') AS translations,
    count(*) FILTER (WHERE event_type = 'USER_REGISTERED') AS new_users
  FROM usage_event WHERE ${IN_RANGE}
  GROUP BY 1 ORDER BY 1`;

const SECTION_VIEWS = `
  SELECT section, count(*) AS visits
  FROM usage_event
  WHERE event_type = 'SECTION_VIEW' AND ${IN_RANGE}
  GROUP BY section
  ORDER BY visits DESC, section`;

const MARK_ERASED = 'INSERT INTO erased_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING';
const UNLINK_REFERENCES = "UPDATE usage_event SET reference_type = NULL, reference_id = NULL WHERE reference_type = 'USER' AND reference_id = $1";
// session_id tambien: identifica la sesion de esa persona en iam.
const UNLINK_USER = 'UPDATE usage_event SET user_id = NULL, session_id = NULL WHERE user_id = $1';
// La misma clave serializa save y unlinkUser, también cuando aún no hay filas.
const LOCK_USER = "SELECT pg_advisory_xact_lock(714306, hashtext($1::text))";
const IS_ERASED = 'SELECT 1 FROM erased_users WHERE user_id = $1';

export const makePostgresUsageEventRepository = (pool: Pool): UsageEventRepository => ({
  async unlinkUser(userId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(LOCK_USER, [userId]);
      await client.query(MARK_ERASED, [userId]);
      await client.query(UNLINK_REFERENCES, [userId]);
      await client.query(UNLINK_USER, [userId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },

  async isUserErased(userId: string) {
    const { rows } = await pool.query(IS_ERASED, [userId]);
    return rows.length > 0;
  },

  async save(event: UsageEvent) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const referenceUser = event.referenceType === 'USER' ? event.referenceId : null;
      // Orden estable si un evento referencia otra cuenta: evita bloqueos cruzados.
      const ids = [...new Set([event.userId, referenceUser].filter((id): id is string => id !== null))].sort();
      const erased = new Set<string>();
      for (const id of ids) {
        await client.query(LOCK_USER, [id]);
        if ((await client.query(IS_ERASED, [id])).rows.length) erased.add(id);
      }
      const userErased = event.userId !== null && erased.has(event.userId);
      if (userErased && event.eventType === 'USER_REGISTERED') {
        await client.query('COMMIT');
        return false;
      }
      if (userErased && event.eventType !== 'TRANSLATION_COMPLETED') throw new AccountErasedError();
      const referenceErased = referenceUser !== null && erased.has(referenceUser);
      const result = await client.query(INSERT_EVENT, [
        event.eventId, userErased ? null : event.userId,
        userErased ? null : event.sessionId, event.section, event.eventType,
        referenceErased ? null : event.referenceType,
        referenceErased ? null : event.referenceId, event.signCodes, event.createdAt,
      ]);
      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },

  async summary({ from, to }: DateRange): Promise<UsageSummary> {
    const { rows } = await pool.query(SUMMARY, [from, to]);
    return { translations: Number(rows[0].translations), newUsers: Number(rows[0].new_users) };
  },

  async topSigns({ from, to }: DateRange, limit: number): Promise<TopSign[]> {
    const { rows } = await pool.query(TOP_SIGNS, [from, to, limit]);
    return rows.map(row => ({ signCode: row.sign_code, translations: Number(row.translations) }));
  },

  async dailySeries({ from, to }: DateRange): Promise<DailyUsage[]> {
    const { rows } = await pool.query(DAILY_SERIES, [from, to]);
    return rows.map(row => ({
      date: row.date, translations: Number(row.translations), newUsers: Number(row.new_users),
    }));
  },

  async sectionViews({ from, to }: DateRange): Promise<SectionVisits[]> {
    const { rows } = await pool.query(SECTION_VIEWS, [from, to]);
    return rows.map(row => ({ section: row.section, visits: Number(row.visits) }));
  },
});
