import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { Pool } from 'pg';
import { TranslationProduced } from '@traduce/shared';
import { withIsolatedPostgres } from '../../../tests/helpers/isolated_postgres';
import { makePostgresUnitOfWork } from '../src/adapters/outbound/postgres/postgres_repositories';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makeEraseUserProfile } from '../src/application/erase_user_profile';
import { makeGetTodayChallenge } from '../src/application/daily_challenge';
import { UnitOfWork } from '../src/ports/repositories';

const required = process.env.GAMIFICATION_PG_TESTS === '1';
const skip = !process.env.PROFILE_TEST_DATABASE_URL && !required ? 'Requiere PostgreSQL exclusivo en 127.0.0.1:55437' : false;
const publisher = { publish: async () => {} };
const event = (translationId: number): TranslationProduced => ({
  translationId, userId: 7, gloss: 'hola', text: 'hola', eligible: true, occurredAt: '2026-10-25T12:00:00Z',
});
const record = (unitOfWork: UnitOfWork) => makeRecordTranslation({ unitOfWork, eventPublisher: publisher });
const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
};
const fixture = (work: (first: Pool, second: Pool) => Promise<void>) => withIsolatedPostgres(async (first, second) => {
  const directory = resolve(__dirname, '../db');
  for (const file of readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    await first.query(readFileSync(resolve(directory, file), 'utf8'));
  }
  // Repetir la nueva migración no duplica ni restaura datos personalizados.
  await first.query(readFileSync(resolve(directory, '009_daily_challenges.sql'), 'utf8'));
  assert.equal((await first.query('SELECT count(*)::int AS count FROM challenges')).rows[0].count,4);
  await first.query("UPDATE challenges SET is_active=(code='TRANSLATE_3'),target_count=2,points=10");
  await work(first,second);
});
const counts = async (pool: Pool, userId = '7') => {
  const { rows } = await pool.query(`SELECT
    (SELECT count(*)::int FROM user_challenges WHERE user_id=$1) AS assignments,
    (SELECT count(*)::int FROM challenge_rewards WHERE user_id=$1) AS rewards,
    (SELECT count(*)::int FROM notifications n JOIN notification_types t USING(notification_type_id)
      WHERE n.user_id=$1 AND t.code='CHALLENGE_COMPLETED') AS notices`,[userId]);
  return rows[0];
};

it('PostgreSQL real: dos eventos concurrentes, recibos y sobres repetidos, recompensa y aviso únicos', { skip }, async () => fixture(async (first,second) => {
  const a = record(makePostgresUnitOfWork(first)); const b = record(makePostgresUnitOfWork(second));
  const id = randomUUID();
  await Promise.all([a(id,'7',event(1)),b(randomUUID(),'7',event(2))]);
  assert.deepEqual(await counts(first),{ assignments:1,rewards:1,notices:1 });
  await Promise.all([a(id,'7',event(1)),b(randomUUID(),'7',event(1))]);
  assert.deepEqual(await counts(first),{ assignments:1,rewards:1,notices:1 });
  const { rows } = await first.query('SELECT current_count,target_count,points,completed_at FROM user_challenges');
  assert.equal(rows[0].current_count,2); assert.ok(rows[0].completed_at);
  assert.equal((await first.query('SELECT sum(points)::int AS points FROM challenge_rewards')).rows[0].points,10);
  assert.equal((await counts(first,'8')).assignments,0);
  const read = makeGetTodayChallenge({ unitOfWork: makePostgresUnitOfWork(first), now: () => new Date('2026-10-25T12:00:00Z') });
  assert.equal((await read('8')).data!.currentCount,0);
  assert.equal((await counts(first,'8')).assignments,0);
}));
it('PostgreSQL real: fallo del aviso revierte evento, recibo, avance y recompensa; reintento concede una vez', { skip }, async () => fixture(async (first) => {
  await first.query('UPDATE challenges SET target_count=1');
  const actual = makePostgresUnitOfWork(first);
  const failing: UnitOfWork = { run: work => actual.run(repositories => work({ ...repositories,
    notifications: { ...repositories.notifications, create: async notification => {
      if (notification.typeCode === 'CHALLENGE_COMPLETED') throw new Error('test rollback');
      return repositories.notifications.create(notification);
    } },
  })) };
  const id = randomUUID();
  await assert.rejects(record(failing)(id,'7',event(1)),/test rollback/);
  assert.deepEqual(await counts(first),{ assignments:0,rewards:0,notices:0 });
  assert.equal((await first.query('SELECT count(*)::int AS count FROM processed_events WHERE event_id=$1',[id])).rows[0].count,0);
  assert.equal((await first.query('SELECT count(*)::int AS count FROM achievement_translation_receipts')).rows[0].count,0);
  await record(actual)(id,'7',event(1));
  assert.deepEqual(await counts(first),{ assignments:1,rewards:1,notices:1 });
}));
for (const deletionFirst of [false,true]) it(`PostgreSQL real: borrado concurrente, deletionFirst=${deletionFirst}, eventos tardíos sin recreación`, { skip }, async () => fixture(async (first,second) => {
  await first.query('UPDATE challenges SET target_count=1');
  const held = deferred(); const release = deferred();
  const actual = makePostgresUnitOfWork(first);
  const holding: UnitOfWork = { run: work => actual.run(async repositories => {
    const result = await work(repositories); held.release(); await release.promise; return result;
  }) };
  const firstTask = deletionFirst
    ? makeEraseUserProfile({ unitOfWork: holding })(randomUUID(),'7')
    : record(holding)(randomUUID(),'7',event(1));
  void firstTask.catch(() => held.release());
  await held.promise;
  const other = makePostgresUnitOfWork(second);
  const secondTask = deletionFirst ? record(other)(randomUUID(),'7',event(2))
    : makeEraseUserProfile({ unitOfWork: other })(randomUUID(),'7');
  release.release();
  await Promise.all([firstTask,secondTask]);
  await record(other)(randomUUID(),'7',event(3));
  assert.deepEqual(await counts(first),{ assignments:0,rewards:0,notices:0 });
  assert.equal((await first.query("SELECT count(*)::int AS count FROM erased_users WHERE user_id='7'")).rows[0].count,1);
  assert.equal((await first.query('SELECT count(*)::int AS count FROM challenges')).rows[0].count,4);
  const read = makeGetTodayChallenge({ unitOfWork: actual });
  assert.equal((await read('7')).data,null);
}));
it('PostgreSQL real: sin avisos concede puntos, catálogo conserva instantánea y día anterior no avanza hoy', { skip }, async () => fixture(async (first) => {
  const actual = makePostgresUnitOfWork(first); const apply = record(actual);
  await first.query("INSERT INTO user_preferences(user_id,notifications_enabled) VALUES ('7',false)");
  await apply(randomUUID(),'7',event(1));
  await first.query("UPDATE challenges SET target_count=8,points=999,is_active=false");
  await apply(randomUUID(),'7',event(2));
  assert.deepEqual(await counts(first),{ assignments:1,rewards:1,notices:0 });
  assert.equal((await first.query('SELECT points FROM challenge_rewards')).rows[0].points,10);
  // Ayer sin catálogo activo no crea un reto nuevo ni altera el de hoy.
  await apply(randomUUID(),'7',{ ...event(3), occurredAt:'2026-10-25T04:59:59Z' });
  assert.equal((await first.query('SELECT current_count FROM user_challenges')).rows[0].current_count,2);
}));
