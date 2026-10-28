import assert from 'node:assert/strict';
import { it } from 'node:test';
import { makeAchievement, makeInMemoryStore } from './in_memory';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makeGetTodayChallenge } from '../src/application/daily_challenge';
import { makeEraseUserProfile } from '../src/application/erase_user_profile';
import { DEFAULT_PREFERENCES } from '../src/domain/preferences';

const setup = (history: number, points = 1, enabled = true) => {
  const catalog = [500,1000,3000].map(target => {
    const p = makeAchievement(`dailyChallengePoints${target}`,target);
    p.achievement.metric = 'DAILY_CHALLENGE_POINTS'; p.achievement.points = 0;
    return p;
  });
  const store = makeInMemoryStore(catalog);
  store.challenges.push({ challengeId:'challenge', code:'TRANSLATE_1', name:'Reto', description:'Confirmado',
    targetCount:1, points, localizations:{} });
  store.rewards.set('history',{userId:'1',points:history});
  store.rewards.set('foreign',{userId:'2',points:9000});
  store.preferencesByUser.set('1',{...DEFAULT_PREFERENCES,notificationsEnabled:enabled});
  const published: unknown[] = [];
  const record = makeRecordTranslation({ unitOfWork:store.unitOfWork, eventPublisher:{publish:async (...args) => {published.push(args);}} });
  const event = {userId:1,translationId:1,gloss:'hola',text:'hola',eligible:true,occurredAt:'2026-10-26T12:00:00Z'};
  return {store,record,event,published};
};
for (const boundary of [499,500,999,1000,2999,3000]) it(`puntos reales, límite ${boundary}, sin sumar premios de medallas`,async () => {
  const {store,record,event,published} = setup(boundary-1);
  await record('first','1',event);
  const progress = [...store.progressOf('1').values()];
  assert.equal(progress.length,3);
  assert.ok(progress.every(p=>p.currentCount===boundary));
  const reached = [500,1000,3000].filter(t=>t<=boundary).length;
  assert.equal(progress.filter(p=>p.achievedAt).length,reached);
  assert.equal(store.notifications.filter(n=>n.typeCode==='ACHIEVEMENT_UNLOCKED').length,reached);
  assert.equal(published.length,reached);
  const before = structuredClone(progress);
  await record('retry','1',event); await record('first','1',{...event,translationId:2});
  assert.deepEqual([...store.progressOf('1').values()],before);
  assert.equal(store.notifications.filter(n=>n.typeCode==='ACHIEVEMENT_UNLOCKED').length,reached);
});
it('cruza varias metas, preferencias apagadas, progreso completo y cero puntos adicionales',async () => {
  const {store,record,event} = setup(499,2501,false);
  const unlocked = await record('first','1',event);
  assert.equal(unlocked.length,3); assert.ok(unlocked.every(p=>p.achievement.points===0));
  assert.equal(store.notifications.length,0);
  assert.ok([...store.progressOf('1').values()].every(p=>p.currentCount===3000));
});
it('GET expone la recompensa persistida aunque cambie la asignación; borrado impide eventos tardíos',async () => {
  const {store,record,event} = setup(499);
  await record('first','1',event);
  const assignment = [...store.assignments.values()][0]; assignment.points=999;
  const read = makeGetTodayChallenge({unitOfWork:store.unitOfWork,now:()=>new Date(event.occurredAt)});
  const data = (await read('1')).data!;
  assert.equal(data.points,999); assert.equal(data.reward!.points,1);
  await makeEraseUserProfile({unitOfWork:store.unitOfWork})('erase','1');
  await record('late','1',{...event,translationId:2});
  assert.equal((await read('1')).data,null);
  assert.equal(store.progressOf('1').size,0);
  assert.equal([...store.rewards.values()].filter(r=>r.userId==='1').length,0);
  assert.equal(store.rewards.get('foreign')!.points,9000);
});
