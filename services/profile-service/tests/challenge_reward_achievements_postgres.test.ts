/** Integración real: únicamente la instancia de pruebas validada por el helper. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { Pool } from 'pg';
import { withIsolatedPostgres } from '../../../tests/helpers/isolated_postgres';
import { makePostgresAchievementRepository, makePostgresUnitOfWork } from '../src/adapters/outbound/postgres/postgres_repositories';
import { makeListAchievements } from '../src/application/list_achievements';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makeEraseUserProfile } from '../src/application/erase_user_profile';
import { UnitOfWork } from '../src/ports/repositories';

const skip = !process.env.PROFILE_TEST_DATABASE_URL && process.env.GAMIFICATION_PG_TESTS !== '1'
  ? 'Requiere instancia exclusiva verificada de PostgreSQL' : false;
const directory = resolve(__dirname, '../db');
const migration = readFileSync(resolve(directory, '010_challenge_reward_achievements.sql'), 'utf8');
const prepare = async (db: Pool) => {
  for (const file of readdirSync(directory).filter(n => /^00\d.*\.sql$/.test(n)).sort()) {
    await db.query(readFileSync(resolve(directory, file), 'utf8'));
  }
};
const seed = async (db: Pool, user: string, points: number) => {
  const { rows } = await db.query(`INSERT INTO user_challenges(user_id,challenge_date,challenge_id,code,name,description,
    target_count,points,current_count,completed_at)
    SELECT $1,'2026-10-24',challenge_id,code,name,description,1,999,1,'2026-10-24T12:00:00Z'
    FROM challenges ORDER BY code LIMIT 1 RETURNING user_challenge_id`, [user]);
  await db.query('INSERT INTO challenge_rewards(user_challenge_id,user_id,points) VALUES ($1,$2,$3)', [rows[0].user_challenge_id,user,points]);
};
const list = (db: Pool) => makeListAchievements({ achievements: makePostgresAchievementRepository(db) });
const rewardProgress = async (db: Pool, user = '7') => (await list(db)(user,2)).filter(p => p.achievement.metric === 'DAILY_CHALLENGE_POINTS');
const event = (id: number) => ({ userId:7,translationId:id,text:'hola',gloss:'hola',eligible:true,occurredAt:'2026-10-26T12:00:00Z' });
const record = (unitOfWork: UnitOfWork) => makeRecordTranslation({unitOfWork,eventPublisher:{publish:async () => {}}});

it('PostgreSQL: historia real, fecha de reconocimiento, repetición sin avisos ni cambios a los 21 logros', { skip }, async () => withIsolatedPostgres(async db => {
  await prepare(db);
  const oldCatalog = (await db.query('SELECT * FROM achievements ORDER BY code')).rows;
  await db.query(`INSERT INTO user_achievements(user_id,achievement_id,current_count,achieved_at)
    SELECT 'history',achievement_id,42,'2026-01-01T00:00:00Z' FROM achievements WHERE is_active`);
  const oldProgress = (await db.query('SELECT * FROM user_achievements ORDER BY achievement_id')).rows;
  for (const total of [499,500,999,1000,2999,3000]) await seed(db,String(total),total);
  const start = Date.now();
  await db.query(migration);
  for (const total of [499,500,999,1000,2999,3000]) {
    const progress = await rewardProgress(db,String(total));
    assert.equal(progress.length,3); assert.ok(progress.every(p=>p.currentCount===total && p.achievement.points===0));
    assert.equal(progress.filter(p=>p.achievedAt).length,[500,1000,3000].filter(t=>t<=total).length);
    assert.ok(progress.filter(p=>p.achievedAt).every(p=>Date.parse(p.achievedAt!)>=start));
  }
  const history = (await db.query('SELECT * FROM user_achievements ORDER BY user_id,achievement_id')).rows;
  await db.query("UPDATE achievements SET name='Personalizado' WHERE code='dailyChallengePoints500'");
  await db.query(migration);
  assert.deepEqual((await db.query('SELECT * FROM user_achievements ORDER BY user_id,achievement_id')).rows,history);
  assert.equal((await db.query("SELECT name FROM achievements WHERE code='dailyChallengePoints500'")).rows[0].name,'Personalizado');
  assert.deepEqual((await db.query("SELECT * FROM achievements WHERE metric <> 'DAILY_CHALLENGE_POINTS' ORDER BY code")).rows,oldCatalog);
  assert.deepEqual((await db.query("SELECT * FROM user_achievements WHERE user_id='history' ORDER BY achievement_id")).rows,oldProgress);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM notifications')).rows[0].count,0);
  assert.ok((await rewardProgress(db,'inactive')).every(p=>p.currentCount===0 && p.achievedAt===null));
  assert.equal((await list(db)('500',1)).length,5);
  assert.equal((await list(db)('500',2)).length,24);
}));

it('PostgreSQL: concurrencia, reintentos, progreso y notificación únicos; borrado y eventos tardíos', { skip }, async () => withIsolatedPostgres(async (db, second) => {
  await prepare(db); await seed(db,'7',499); await db.query(migration);
  await db.query("UPDATE challenges SET is_active=(code='TRANSLATE_1'), target_count=1,points=1");
  const a=record(makePostgresUnitOfWork(db)), b=record(makePostgresUnitOfWork(second));
  const id=randomUUID();
  await Promise.all([a(id,'7',event(1)),b(randomUUID(),'7',event(2))]);
  await a(id,'7',event(1)); await b(randomUUID(),'7',event(1));
  const progress=await rewardProgress(db);
  assert.ok(progress.every(p=>p.currentCount===500)); assert.equal(progress.filter(p=>p.achievedAt).length,1);
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM notifications n JOIN achievements a ON a.achievement_id=n.reference_id
    WHERE n.user_id='7' AND a.metric='DAILY_CHALLENGE_POINTS'`)).rows[0].count,1);
  await makeEraseUserProfile({unitOfWork:makePostgresUnitOfWork(db)})(randomUUID(),'7');
  await b(randomUUID(),'7',event(3)); await db.query(migration);
  for (const table of ['challenge_rewards','user_challenges','user_achievements','notifications']) {
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table} WHERE user_id='7'`)).rows[0].count,0);
  }
  assert.equal((await db.query("SELECT count(*)::int AS count FROM erased_users WHERE user_id='7'")).rows[0].count,1);
  assert.equal((await list(db)('other',2)).length,24);
}));

it('PostgreSQL: rollback conjunto al fallar un aviso de medalla; reintento cruza tres metas una vez', { skip }, async () => withIsolatedPostgres(async db => {
  await prepare(db); await db.query(migration);
  await db.query("UPDATE challenges SET is_active=(code='TRANSLATE_1'),target_count=1,points=3000");
  const actual=makePostgresUnitOfWork(db);
  const failing: UnitOfWork={run:work=>actual.run(repos=>work({...repos,notifications:{...repos.notifications,create:async notice=>{
    if(notice.typeCode==='ACHIEVEMENT_UNLOCKED') throw new Error('rollback medal');
    return repos.notifications.create(notice);
  }}}))};
  const id=randomUUID();
  await assert.rejects(record(failing)(id,'7',event(1)),/rollback medal/);
  for(const table of ['user_challenges','challenge_rewards','user_achievements','notifications','achievement_translation_receipts','processed_events']) {
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count,0);
  }
  await record(actual)(id,'7',event(1));
  assert.ok((await rewardProgress(db)).every(p=>p.currentCount===3000 && p.achievedAt));
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM notifications n JOIN achievements a ON a.achievement_id=n.reference_id
    WHERE a.metric='DAILY_CHALLENGE_POINTS'`)).rows[0].count,3);
}));
