import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { makeListAchievements } from '../src/application/list_achievements';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makePostgresAchievementRepository, makePostgresUnitOfWork } from '../src/adapters/outbound/postgres/postgres_repositories';
import { makeAchievement, makeInMemoryStore } from './in_memory';
import { withIsolatedPostgres } from '../../../tests/helpers/isolated_postgres';

const sql = readFileSync(resolve(__dirname, '../db/006_translation_milestones.sql'), 'utf8');
const localizations = [...sql.matchAll(/localizations = '(.*)'::jsonb/g)].map(match => JSON.parse(match[1]));
const codes = ['FIRST_TRANSLATION','TEN_TRANSLATIONS','FIFTY_TRANSLATIONS','hundredSigns','thousandSigns'];
const targets = [1,10,50,100,1000];
const definitions = () => codes.map((code, index) => {
  const p = makeAchievement(code, targets[index]);
  if (index >= 3) Object.assign(p.achievement, { collection: 'catalog', availability: 'available',
    category: 'translation', level: index === 3 ? 'silver' : 'gold', points: 0,
    localizations: localizations[index - 3] });
  return p;
});

it('006 adapts existing rows without assigning points or touching history', () => {
  assert.match(sql, /WHERE code = 'hundredSigns'/);
  assert.match(sql, /WHERE code = 'thousandSigns'/);
  assert.doesNotMatch(sql, /(?:INSERT INTO|DELETE FROM|TRUNCATE|UPDATE)\s+(?:user_achievements|notifications|processed_events)/i);
  assert.doesNotMatch(sql, /\bpoints\s*=|\bachievement_id\s*=/i);
  assert.equal(localizations.length, 2);
  for (const [index, target] of [100,1000].entries()) {
    for (const [language, unit] of Object.entries({ es: 'traducciones', en: 'translations', fr: 'traductions', pt: 'traduções' })) {
      const text = localizations[index][language];
      assert.ok(text.name.includes(unit));
      assert.ok(text.description.includes(unit));
      assert.ok(text.name.replace(/\D/g, '') === String(target));
      assert.ok(text.description.replace(/\D/g, '') === String(target));
      assert.equal('unavailableReason' in text, false);
    }
  }
});

it('earns all five with new events, freezes each counter and preserves v1/v2 shapes', async () => {
  const store = makeInMemoryStore(definitions());
  const published: any[] = [];
  let locks = 0;
  store.repositories.gamificationLocks.lockUser = async () => { locks++; };
  const record = makeRecordTranslation({ unitOfWork: store.unitOfWork,
    eventPublisher: { publish: async (_type, payload) => { published.push(payload); } } });
  const list = makeListAchievements({ achievements: store.repositories.achievements });
  for (let n = 1; n <= 1000; n++) {
    await record(`translation-${n}`, 'fresh');
    if ([99,100,999,1000].includes(n)) {
      const items = await list('fresh',2);
      assert.equal(items[3].currentCount, Math.min(n,100));
      assert.equal(items[3].achievedAt !== null, n >= 100);
      assert.equal(items[4].currentCount, n);
      assert.equal(items[4].achievedAt !== null, n >= 1000);
    }
  }
  const before = await list('fresh',2);
  await record('translation-1000', 'fresh');
  await record('translation-1001', 'fresh');
  assert.deepEqual(await list('fresh',2), before);
  assert.deepEqual(before.map(p => p.currentCount), targets);
  assert.equal(locks, 1001); // replay never re-enters the transaction work
  assert.equal(store.notifications.length, 5);
  assert.equal(published.length, 5);
  assert.deepEqual(published.slice(3).map(p => [p.code,p.points]), [['hundredSigns',0],['thousandSigns',0]]);
  const v1 = await list('fresh',1);
  assert.deepEqual(v1.map(p => p.achievement.code), codes);
  assert.ok(v1.every(p => !('collection' in p.achievement) && !('localizations' in p.achievement)));
  assert.deepEqual(v1.map(p => [p.achievement.id,p.currentCount,p.achievedAt]),
    before.map(p => [p.achievement.id,p.currentCount,p.achievedAt]));
  assert.deepEqual((await list('other',2)).map(p => p.currentCount), [0,0,0,0,0]);
});

it('006 preserves UUIDs/history, starts fresh counters and earns both milestones using real PostgreSQL',
  { skip: !process.env.PROFILE_TEST_DATABASE_URL }, async () => {
    await withIsolatedPostgres(async pool => {
      for (const file of ['001_profile.sql','002_erased_users.sql','003_ui_languages.sql','004_achievement_catalog.sql','005_obtainable_achievements.sql']) {
        await pool.query(readFileSync(resolve(__dirname, '../db', file), 'utf8'));
      }
      await pool.query(`INSERT INTO user_achievements (user_id,achievement_id,current_count,achieved_at,notified_at)
        SELECT 'veteran',achievement_id,target_count,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'
        FROM achievements WHERE collection='legacy'`);
      await pool.query(`INSERT INTO user_achievements (user_id,achievement_id,current_count,achieved_at,notified_at)
        SELECT 'archived',achievement_id,CASE WHEN code='hundredSigns' THEN 7 ELSE 1 END,
          CASE WHEN code='thousandSigns' THEN '2026-01-01T00:00:00Z'::timestamptz END,
          CASE WHEN code='thousandSigns' THEN '2026-01-02T00:00:00Z'::timestamptz END
        FROM achievements WHERE code IN ('hundredSigns','thousandSigns')`);
      await pool.query(`INSERT INTO notifications (user_id,notification_type_id,title,body,reference_type,reference_id)
        SELECT 'archived',nt.notification_type_id,'Historical notice','Historical body','ACHIEVEMENT',a.achievement_id
        FROM achievements a CROSS JOIN notification_types nt WHERE a.code='thousandSigns'`);
      // Las tablas de retos son independientes; no adelantar 006/007, cuyos estados se verifican aquí.
      for (const file of ['008_admin_reports.sql', '009_daily_challenges.sql']) {
        await pool.query(readFileSync(resolve(__dirname, '../db', file), 'utf8'));
      }
      const record = makeRecordTranslation({ unitOfWork: makePostgresUnitOfWork(pool), eventPublisher: { publish: async () => {} } });
      const beforeActivation = randomUUID();
      await record(beforeActivation,'veteran');
      const history = (await pool.query('SELECT * FROM user_achievements ORDER BY user_achievement_id')).rows;
      const notices = (await pool.query('SELECT * FROM notifications ORDER BY notification_id')).rows;
      const identity = async () => (await pool.query('SELECT achievement_id,code,points FROM achievements ORDER BY code')).rows;
      const before = await identity();
      const apply = async () => {
        if (!process.env.PROFILE_TEST_PSQL) { await pool.query(sql); return; }
        const schema = (await pool.query('SELECT current_schema() AS schema')).rows[0].schema;
        execFileSync(process.env.PROFILE_TEST_PSQL, ['-X','-v','ON_ERROR_STOP=1','--dbname',process.env.PROFILE_TEST_DATABASE_URL!,
          '-f',resolve(__dirname,'../db/006_translation_milestones.sql')],
        { env: { ...process.env, PGOPTIONS: `-c search_path=${schema}` }, stdio: 'pipe' });
      };
      await apply(); await apply();
      assert.deepEqual(await identity(), before);
      assert.deepEqual((await pool.query('SELECT * FROM user_achievements ORDER BY user_achievement_id')).rows, history);
      assert.deepEqual((await pool.query('SELECT * FROM notifications ORDER BY notification_id')).rows, notices);
      const list = makeListAchievements({ achievements: makePostgresAchievementRepository(pool) });
      for (const version of [1,2] as const) {
        const items = await list('fresh',version);
        assert.deepEqual(items.map(p => p.achievement.code), codes);
        assert.deepEqual(items.map(p => p.achievement.targetCount), targets);
        assert.deepEqual(items.map(p => p.currentCount), [0,0,0,0,0]);
        assert.ok(items.every(p => p.achievedAt === null && p.achievement.metric === 'TRANSLATIONS_COMPLETED'));
      }
      const available = (await list('fresh',2)).slice(3);
      assert.deepEqual(available.map(p => 'localizations' in p.achievement ? p.achievement.localizations : undefined), localizations);
      assert.deepEqual(available.map(p => p.achievement.points), [0,0]);
      await record(beforeActivation,'veteran');
      assert.deepEqual((await list('veteran',2)).map(p => p.currentCount),[1,10,50,0,0]);
      await record(randomUUID(),'veteran');
      assert.deepEqual((await list('veteran',2)).map(p => p.currentCount), [1,10,50,1,1]);
      // Actual event processing from zero; no reconstruction from frozen legacy counters.
      for (let n=1; n<=1000; n++) {
        const id = randomUUID();
        await record(id,'fresh');
        if ([99,100,999,1000].includes(n)) {
          await record(id,'fresh');
          const items = await list('fresh',2);
          assert.equal(items[3].currentCount, Math.min(n,100));
          assert.equal(items[3].achievedAt !== null,n>=100);
          assert.equal(items[4].currentCount,n);
          assert.equal(items[4].achievedAt !== null,n>=1000);
        }
      }
      const earned = await list('fresh',2);
      assert.deepEqual(earned.map(p => p.currentCount),targets);
      assert.ok(earned.every(p => p.achievedAt !== null));
      await record(randomUUID(),'fresh');
      assert.deepEqual(await list('fresh',2),earned);
      assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM notifications WHERE user_id='fresh'")).rows[0].n,5);
      assert.deepEqual((await list('fresh',1)).map(p => [p.achievement.id,p.currentCount,p.achievedAt]),
        earned.map(p => [p.achievement.id,p.currentCount,p.achievedAt]));
      // Boundary fixtures verify the same per-user lock prevents concurrent duplicate unlocks.
      await pool.query(`INSERT INTO user_achievements (user_id,achievement_id,current_count)
        SELECT 'race',achievement_id,target_count-1 FROM achievements WHERE code IN ('hundredSigns','thousandSigns')`);
      await Promise.all([record(randomUUID(),'race'),record(randomUUID(),'race')]);
      const raced = (await list('race',2)).slice(3);
      assert.deepEqual(raced.map(p => p.currentCount),[100,1000]);
      assert.ok(raced.every(p => p.achievedAt !== null));
      assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM notifications n JOIN achievements a ON a.achievement_id=n.reference_id
        WHERE n.user_id='race' AND a.code IN ('hundredSigns','thousandSigns')`)).rows[0].n,2);
      assert.deepEqual((await pool.query('SELECT * FROM user_achievements WHERE user_achievement_id=ANY($1::uuid[]) ORDER BY user_achievement_id',
        [history.map(p => p.user_achievement_id)])).rows,history);
      assert.deepEqual((await pool.query("SELECT * FROM notifications WHERE user_id='archived' ORDER BY notification_id")).rows,notices);
    });
  });
