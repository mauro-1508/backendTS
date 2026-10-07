import { Pool } from 'pg';
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

export const makePostgresUsageEventRepository = (pool: Pool): UsageEventRepository => ({
  async save(event: UsageEvent) {
    const result = await pool.query(INSERT_EVENT, [
      event.eventId, event.userId, event.sessionId, event.section, event.eventType,
      event.referenceType, event.referenceId, event.signCodes, event.createdAt,
    ]);
    return (result.rowCount ?? 0) > 0;
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
