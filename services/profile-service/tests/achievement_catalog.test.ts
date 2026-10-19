import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { makeListAchievements, serializeAchievement } from '../src/application/list_achievements';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makeAchievement, makeInMemoryStore } from './in_memory';
import { makePostgresAchievementRepository, makePostgresUnitOfWork } from '../src/adapters/outbound/postgres/postgres_repositories';
import { makeProfileController, ProfileUseCases } from '../src/adapters/inbound/http/profile_controller';
import { withIsolatedPostgres } from '../../../tests/helpers/isolated_postgres';

const migration = readFileSync(resolve(__dirname, '../db/004_achievement_catalog.sql'), 'utf8');
const codes = [...migration.matchAll(/^  \('([^']+)'/gm)].map(m => m[1]);
const expected = ['firstSign','hundredSigns','thousandSigns','fullConversation','voiceOn','twoWay','offline',
  'firstPractice','steadyHand','perfectPulse','sprinter','fingerspelling','honestReview','facialExpression',
  'firstTen','twoHundred','everyday','numbersHours','regionalisms','sevenDays','thirtyDays','beforeDawn','sharedSign','bridge'];
const upcoming = () => {
  const p = makeAchievement('firstSign', 1);
  p.achievement = { ...p.achievement, metric: 'CATALOG_REQUIREMENT', collection: 'catalog', availability: 'upcoming',
    category: 'translation', level: 'bronze', localizations: { es: { name: 'Primera seña', description: 'Cámara', unavailableReason: 'Este logro estará disponible en una próxima actualización.' } } };
  return p;
};

describe('expanded catalogue contract', () => {
  it('seeds exactly the 24 historical codes without replacing legacy seeds', () => {
    assert.deepEqual(codes, expected);
    assert.equal(new Set(codes).size, 24);
    assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM|TRUNCATE)\s+(?:user_achievements|achievements|notifications|processed_events)/i);
    assert.match(migration, /ON CONFLICT \(code\) DO NOTHING/);
  });
  it('uses simple localized upcoming copy for all 24 achievements', () => {
    const messages: Record<string, string> = {
      "es": "Este logro estará disponible en una próxima actualización.",
      "en": "This achievement will be available in a future update.",
      "fr": "Ce succès sera disponible dans une prochaine mise à jour.",
      "pt": "Esta conquista estará disponível em uma próxima atualização."
    };
    const entries = [...migration.matchAll(/, '(\{"es":.*\})', FALSE\)/g)]
      .map(match => JSON.parse(match[1].replace(/''/g, "'")));
    assert.equal(entries.length, 24);
    for (const localizations of entries) {
      for (const [language, message] of Object.entries(messages)) {
        assert.equal(localizations[language].unavailableReason, message);
      }
    }
  });
  it('exposes unavailable progress and target as null, never storage sentinels', () => {
    const p = upcoming();
    p.currentCount = 42;
    p.achievedAt = '2026-01-01T00:00:00.000Z';
    const result = serializeAchievement(p);
    assert.equal(result.currentCount, null);
    assert.equal(result.achievement.targetCount, null);
    assert.equal(result.achievedAt, null);
    assert.equal(result.achievement.availability, 'upcoming');
  });
  it('preserves every measured legacy value including achievedAt', () => {
    const p = makeAchievement('TEN_TRANSLATIONS', 10);
    p.currentCount = 10;
    p.achievedAt = '2026-01-01T00:00:00.000Z';
    const result = serializeAchievement(p);
    assert.equal(result.achievement.id, p.achievement.id);
    assert.equal(result.achievement.targetCount, 10);
    assert.equal(result.currentCount, 10);
    assert.equal(result.achievedAt, p.achievedAt);
    assert.equal(result.achievement.collection, 'legacy');
    assert.equal(result.achievement.availability, 'available');
  });
  it('does not expose localized secret text', () => {
    const p = makeAchievement('SECRET', 1, true);
    p.achievement.localizations = { en: { name: 'secret', description: 'secret' } };
    assert.deepEqual(serializeAchievement(p).achievement.localizations, {});
    assert.equal(serializeAchievement(p).achievement.name, '???');
  });
  it('continues all three legacy rules, once per event and per user, without advancing upcoming entries', async () => {
    const store = makeInMemoryStore([makeAchievement('FIRST_TRANSLATION',1), makeAchievement('TEN_TRANSLATIONS',10),
      makeAchievement('FIFTY_TRANSLATIONS',50), upcoming()]);
    const publisher = { publish: async () => {} };
    const record = makeRecordTranslation({ unitOfWork: store.unitOfWork, eventPublisher: publisher });
    const list = makeListAchievements({ achievements: store.repositories.achievements });
    for (let n = 0; n < 60; n++) await record(`event-${n}`, 'alice');
    const before = await list('alice', 2);
    await record('event-59', 'alice');
    assert.deepEqual(await list('alice', 2), before);
    assert.deepEqual(before.slice(0,3).map(p => p.currentCount), [1,10,50]);
    assert.ok(before.slice(0,3).every(p => p.achievedAt !== null));
    assert.equal(before[3].currentCount, null);
    assert.equal(store.notifications.length, 3);
    assert.deepEqual((await list('bob', 2)).slice(0,3).map(p => p.currentCount), [0,0,0]);
  });
  it('keeps v1 measured-only and publishes null progress exclusively through v2', async () => {
    const store = makeInMemoryStore([makeAchievement('FIRST_TRANSLATION', 1), upcoming()]);
    const list = makeListAchievements({ achievements: store.repositories.achievements });
    const old = await list('alice');
    assert.equal(old.length, 1);
    assert.equal(old[0].achievement.code, 'FIRST_TRANSLATION');
    assert.equal('availability' in old[0].achievement, false);
    assert.equal(old[0].currentCount, 0);
    const modern = await list('alice', 2);
    assert.equal(modern.length, 2);
    assert.equal(modern[1].currentCount, null);
  });
  it('negotiates the HTTP version explicitly and rejects invalid versions without querying', async () => {
    const calls: unknown[] = [];
    const unused = async (): Promise<never> => { throw new Error('Unexpected use case'); };
    const useCases: ProfileUseCases = {
      getProfile: unused, getPreferences: unused, updatePreferences: unused,
      listNotifications: unused, markNotificationRead: unused,
      listAchievements: async (...args) => { calls.push(args); return []; },
    };
    const controller = makeProfileController(useCases);
    for (const [requested, expectedStatus] of [[undefined,200],['1',200],['2',200],['3',400],[['2','1'],400]] as const) {
      let status = 200; let body: any;
      const response = { status: (code: number) => { status = code; return response; },
        json: (value: unknown) => { body = value; return response; } } as unknown as Response;
      await controller.listAchievements({ user: { userId: 7 }, query: { catalogVersion: requested } } as unknown as Request, response);
      assert.equal(status, expectedStatus);
      if (requested === '2') assert.deepEqual(body.meta, { catalogVersion: 2 });
      else if (expectedStatus === 200) assert.deepEqual(body, { data: [] });
    }
    assert.deepEqual(calls, [['7',1],['7',1],['7',2]]);
  });
  it('guards upcoming entries even if assigned a counting metric accidentally', async () => {
    const p = upcoming(); p.achievement.metric = 'TRANSLATIONS_COMPLETED';
    const store = makeInMemoryStore([p]);
    await makeRecordTranslation({ unitOfWork: store.unitOfWork, eventPublisher: { publish: async () => {} } })('e', 'alice');
    assert.equal(store.progressOf('alice').size, 0);
    assert.equal(store.notifications.length, 0);
  });
});

it('migration preserves legacy UUIDs, progress, dates and notifications and is repeatable',
  { skip: !process.env.PROFILE_TEST_DATABASE_URL }, async () => {
    await withIsolatedPostgres(async pool => {
      await pool.query(readFileSync(resolve(__dirname, '../db/001_profile.sql'), 'utf8'));
      await pool.query(`INSERT INTO user_achievements (user_id, achievement_id, current_count, achieved_at, notified_at)
        SELECT 'alice', achievement_id, target_count, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z' FROM achievements`);
      await pool.query(`INSERT INTO notifications (user_id, notification_type_id, title, body, reference_type, reference_id)
        SELECT 'alice', nt.notification_type_id, 'Legacy', 'Legacy', 'ACHIEVEMENT', a.achievement_id
        FROM achievements a CROSS JOIN notification_types nt`);
      const snapshot = async () => ({
        definitions: (await pool.query(`SELECT achievement_id,code,target_count FROM achievements WHERE code IN
          ('FIRST_TRANSLATION','TEN_TRANSLATIONS','FIFTY_TRANSLATIONS') ORDER BY code`)).rows,
        progress: (await pool.query('SELECT * FROM user_achievements ORDER BY achievement_id')).rows,
        notices: (await pool.query('SELECT * FROM notifications ORDER BY notification_id')).rows,
      });
      const before = await snapshot();
      const apply = async () => {
        if (!process.env.PROFILE_TEST_PSQL) { await pool.query(migration); return; }
        const schema = (await pool.query('SELECT current_schema() AS schema')).rows[0].schema;
        // withIsolatedPostgres has already verified this exact local database/role.
        // Exercise the project's psql -f procedure, restricted to our random schema.
        execFileSync(process.env.PROFILE_TEST_PSQL, ['-X', '-v', 'ON_ERROR_STOP=1',
          '--dbname', process.env.PROFILE_TEST_DATABASE_URL!, '-f', resolve(__dirname, '../db/004_achievement_catalog.sql')],
        { env: { ...process.env, PGOPTIONS: `-c search_path=${schema}` }, stdio: 'pipe' });
      };
      await apply();
      const newIdentity = (await pool.query(`SELECT achievement_id, code FROM achievements
        WHERE collection='catalog' ORDER BY code`)).rows;
      await apply();
      assert.deepEqual((await pool.query(`SELECT achievement_id, code FROM achievements
        WHERE collection='catalog' ORDER BY code`)).rows, newIdentity);
      await assert.rejects(pool.query(`UPDATE achievements SET is_active=TRUE WHERE code='firstSign'`),
        (error: any) => error.code === '23514');
      assert.deepEqual(await snapshot(), before);
      const { rows } = await pool.query(`SELECT code, availability, is_active FROM achievements WHERE collection='catalog' ORDER BY display_order`);
      assert.deepEqual(rows.map(r => r.code), expected);
      assert.ok(rows.every(r => r.availability === 'upcoming' && r.is_active === false));
      // This is the unmodified pre-004 repository's publication predicate. It must
      // never expose a new metric, the placeholder target or a fabricated zero.
      const oldRead = await pool.query(`SELECT a.code, a.metric, a.target_count,
        COALESCE(ua.current_count, 0) AS current_count
        FROM achievements a LEFT JOIN user_achievements ua
          ON ua.achievement_id=a.achievement_id AND ua.user_id=$1
        WHERE a.is_active ORDER BY a.target_count`, ['alice']);
      assert.deepEqual(oldRead.rows.map(r => r.code), ['FIRST_TRANSLATION','TEN_TRANSLATIONS','FIFTY_TRANSLATIONS']);
      assert.ok(oldRead.rows.every(r => r.metric === 'TRANSLATIONS_COMPLETED'));
      const list = makeListAchievements({ achievements: makePostgresAchievementRepository(pool) });
      const v1 = await list('alice');
      assert.equal(v1.length, 3);
      assert.ok(v1.every(p => !('availability' in p.achievement)));
      const v2 = await list('alice', 2);
      assert.equal(v2.length, 27);
      const modern = v2.filter(p => 'collection' in p.achievement && p.achievement.collection === 'catalog');
      assert.equal(modern.length, 24);
      assert.ok(modern.every(p => p.currentCount === null && p.achievement.targetCount === null && p.achievedAt === null));
      // The deletion guard is part of the real translation unit of work.
      await pool.query(readFileSync(resolve(__dirname, '../db/002_erased_users.sql'), 'utf8'));
      await pool.query(`INSERT INTO user_preferences (user_id, notifications_enabled) VALUES ('bob', FALSE)`);
      const record = makeRecordTranslation({ unitOfWork: makePostgresUnitOfWork(pool), eventPublisher: { publish: async () => {} } });
      const eventId = randomUUID();
      await record(eventId, 'bob');
      await record(eventId, 'bob');
      const bob = await list('bob');
      assert.deepEqual(bob.map(p => p.currentCount), [1,1,1]);
      assert.equal(bob.filter(p => p.achievedAt !== null).length, 1);
      assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id='bob'`)).rows[0].n, 0);
      assert.deepEqual((await list('alice')).map(p => p.currentCount), [1,10,50]);
      assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM user_achievements ua
        JOIN achievements a USING (achievement_id) WHERE a.collection='catalog'`)).rows[0].n, 0);
    });
  });
