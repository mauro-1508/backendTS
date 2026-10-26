import assert from 'node:assert/strict';
import { it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TranslationProduced } from '@traduce/shared';
import { makeAchievement, makeInMemoryStore } from './in_memory';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makeRecordActivity } from '../src/application/record_activity';
import { makeListAchievements } from '../src/application/list_achievements';
import { normalizeWord, RECOGNIZABLE_WORDS, WORD_CATEGORIES, ALPHABET_CODES } from '../src/domain/translation_vocabulary';
import { AchievementMetric } from '../src/domain/achievement';
import { withIsolatedPostgres } from '../../../tests/helpers/isolated_postgres';
import { makePostgresUnitOfWork, makePostgresAchievementRepository } from '../src/adapters/outbound/postgres/postgres_repositories';

const publisher = { publish: async () => {} };
const sessionId = 'test-session-123456789';
const event = (id: number, text = 'hola', mode: 'letters' | 'words' = 'words', occurredAt = '2026-10-21T15:00:00Z'): TranslationProduced =>
  ({ translationId: id, userId: 1, gloss: text, text, occurredAt, eligible: true, mode, sessionId });
const catalog = () => (['TRANSLATIONS_COMPLETED','FAVORITE_WORD','DISTINCT_WORDS','TRANSLATION_DAYS','BOTH_MODES','WORD_CATEGORIES','VOICE_COMPLETED','ACTIVE_SECONDS','LETTERS_VIEWED'] as AchievementMetric[]).map(metric => {
  const progress = makeAchievement(metric, metric === 'VOICE_COMPLETED' ? 1 : metric === 'ACTIVE_SECONDS' ? 10 : 5);
  progress.achievement.metric = metric; return progress;
});

it('normalizes whole words without collapsing ñ, letters or phrases; catalogue limits are explicit', () => {
  assert.equal(normalizeWord(' BAN\u0303O '), 'baño');
  assert.notEqual(normalizeWord('bano'), normalizeWord('baño'));
  assert.equal(RECOGNIZABLE_WORDS.size,43);
  assert.equal(RECOGNIZABLE_WORDS.has('a'),false);
  assert.equal(RECOGNIZABLE_WORDS.has('buenas noches'),false);
  assert.equal(new Set(Object.values(WORD_CATEGORIES)).size,7);
  assert.equal(ALPHABET_CODES.size,27);
});

it('confirmed translations deduplicate semantic IDs, isolate users, count max same-word and Bogota days', async () => {
  const store = makeInMemoryStore(catalog());
  const record = makeRecordTranslation({ unitOfWork: store.unitOfWork, eventPublisher: publisher });
  for (let i=1;i<=4;i++) await record(randomUUID(),'1',event(i));
  let state = await store.repositories.activity!.load('1');
  assert.equal(state.words.hola,4);
  assert.equal(store.progressOf('1').get('id-FAVORITE_WORD')!.achievedAt,null);
  await record(randomUUID(),'1',event(4));
  assert.equal((await store.repositories.activity!.load('1')).words.hola,4);
  const unlocks = await record(randomUUID(),'1',event(5));
  assert.ok(unlocks.some(p=>p.achievement.metric==='FAVORITE_WORD'));
  for (const [index,word] of ['gracias','bien','si','azul'].entries()) await record(randomUUID(),'1',event(index+6,word));
  state = await store.repositories.activity!.load('1');
  assert.equal(Math.max(...Object.values(state.words)),5);
  assert.equal(Object.keys(state.words).length,5);
  assert.equal(state.categories.length,5);
  assert.ok(store.progressOf('1').get('id-WORD_CATEGORIES')?.achievedAt);
  await record(randomUUID(),'1',event(20,'hola','letters'));
  await record(randomUUID(),'1',event(21,'buenas noches'));
  assert.equal((await store.repositories.activity!.load('1')).words.hola,5);
  assert.equal(Object.keys((await store.repositories.activity!.load('2')).words).length,0);
  // UTC dates across midnight are still the SAME calendar day in Bogota.
  await record(randomUUID(),'3',event(30,'hola','words','2026-10-21T23:59:00Z'));
  await record(randomUUID(),'3',event(31,'hola','words','2026-10-22T00:01:00Z'));
  assert.equal((await store.repositories.activity!.load('3')).days.length,1);
  await record(randomUUID(),'3',event(32,'hola','words','2026-10-22T05:00:00Z'));
  assert.equal((await store.repositories.activity!.load('3')).days.length,2);
  for (const [index,date] of ['2026-10-25','2026-11-01','2026-11-09'].entries()) {
    await record(randomUUID(),'3',event(33+index,'hola','words',`${date}T12:00:00Z`));
  }
  assert.ok(store.progressOf('3').get('id-TRANSLATION_DAYS')?.achievedAt);
  await record(randomUUID(),'4',{ ...event(40), eligible:false });
  assert.equal(store.progressOf('4').size,0);
  store.erasedUsers.add('5');
  await record(randomUUID(),'5',event(41));
  assert.equal(store.progressOf('5').size,0);
});

it('server-bounded active intervals reject idle gaps, foreign sessions and arbitrary increments; cancelled/error voice never counts', async () => {
  const store = makeInMemoryStore(catalog());
  let now = 100000;
  const state = await store.repositories.activity!.load('1');
  Object.assign(state,{ session:sessionId, confirmedAt:now, translations:[1] });
  await store.repositories.activity!.save('1',state);
  const record = makeRecordActivity({ unitOfWork:store.unitOfWork,eventPublisher:publisher,now:()=>now });
  const send = (kind: string, extra = {}) => record('1',{ sessionId,kind,...extra });
  await send('tick',{seconds:9999999}); now+=5000;
  await send('tick',{seconds:9999999});
  assert.equal((await store.repositories.activity!.load('1')).activeSeconds,5);
  await send('pause'); now+=5000; await send('tick');
  assert.equal((await store.repositories.activity!.load('1')).activeSeconds,5);
  now+=20000; await send('tick');
  assert.equal((await store.repositories.activity!.load('1')).activeSeconds,5);
  await record('1',{sessionId:'foreign-session-123456',kind:'tick'});
  assert.equal((await store.repositories.activity!.load('1')).activeSeconds,5);
  let playbackId = (await send('voice-start',{translationId:1})).playbackId;
  now+=1000; await send('voice-cancel',{playbackId}); await send('voice-end',{playbackId});
  assert.equal((await store.repositories.activity!.load('1')).voice,0);
  playbackId=(await send('voice-start',{translationId:1})).playbackId;
  now+=1000;
  await record('1',{sessionId:'foreign-session-123456',kind:'voice-end',playbackId});
  assert.equal((await store.repositories.activity!.load('1')).voice,0);
  await send('voice-end',{playbackId}); await send('voice-end',{playbackId});
  assert.equal((await store.repositories.activity!.load('1')).voice,1);
  await assert.rejects(record('2',{sessionId,kind:'voice-start',translationId:1}));
  await send('letter',{code:'LETTER_A'}); await send('letter',{code:'LETTER_A'});
  assert.equal((await store.repositories.activity!.load('1')).letters.length,1);
  await assert.rejects(send('letter',{code:'WORD_HOLA'}));
});

it('new migration preserves history and obtains 21 rules, with real transaction races', { skip:!process.env.PROFILE_TEST_DATABASE_URL }, async()=> {
  await withIsolatedPostgres(async (pool, second)=> {
    for (const file of ['001_profile.sql','002_erased_users.sql','003_ui_languages.sql','004_achievement_catalog.sql','005_obtainable_achievements.sql','006_translation_milestones.sql']) {
      await pool.query(readFileSync(resolve(__dirname,'../db',file),'utf8'));
    }
    const identity=(await pool.query('SELECT achievement_id,code,points FROM achievements ORDER BY code')).rows;
    await pool.query(`INSERT INTO user_achievements(user_id,achievement_id,current_count,achieved_at)
      SELECT 'historical',achievement_id,target_count,NOW() FROM achievements WHERE is_active`);
    const history=(await pool.query('SELECT * FROM user_achievements ORDER BY achievement_id')).rows;
    const migration=readFileSync(resolve(__dirname,'../db/007_functional_achievements.sql'),'utf8');
    await pool.query(migration); await pool.query(migration);
    // El consumidor actual también usa retos; completar el esquema sin alterar la prueba histórica de 007.
    for (const file of ['008_admin_reports.sql', '009_daily_challenges.sql']) {
      await pool.query(readFileSync(resolve(__dirname, '../db', file), 'utf8'));
    }
    assert.deepEqual((await pool.query('SELECT * FROM user_achievements ORDER BY achievement_id')).rows,history);
    for(const row of identity) assert.deepEqual((await pool.query('SELECT achievement_id,code,points FROM achievements WHERE code=$1',[row.code])).rows[0],row);
    const list=makeListAchievements({achievements:makePostgresAchievementRepository(pool)});
    assert.equal((await list('1',2)).length,21);
    assert.equal((await list('1',1)).length,5);
    const record=makeRecordTranslation({unitOfWork:makePostgresUnitOfWork(pool),eventPublisher:publisher});
    const recordSecond=makeRecordTranslation({unitOfWork:makePostgresUnitOfWork(second),eventPublisher:publisher});
    await Promise.all(Array.from({length:25},(_,i)=>(i%2?record:recordSecond)(randomUUID(),'1',event(i+1))));
    await Promise.all(Array.from({length:10},(_,i)=>(i%2?record:recordSecond)(randomUUID(),'1',event(1))));
    const state=(await pool.query('SELECT state FROM achievement_activity WHERE user_id=$1',['1'])).rows[0].state;
    assert.equal(state.words.hola,25);
    assert.equal((await list('2',2)).every(p=>p.currentCount===0),true);
    assert.equal((await list('1',2)).find(p=>p.achievement.code==='favoriteWord25')?.achievedAt!==null,true);
  });
});

it('favorite-word levels require 10,25,50 of one word, not mixed totals; both modes require ten each',async()=>{
 const levels=[10,25,50].map(n=>{const p=makeAchievement(`favorite${n}`,n);p.achievement.metric='FAVORITE_WORD';return p;});
 const both=makeAchievement('both',10);both.achievement.metric='BOTH_MODES';
 const distinct=makeAchievement('distinct',20);distinct.achievement.metric='DISTINCT_WORDS';
 const store=makeInMemoryStore([...levels,both,distinct]);
 const record=makeRecordTranslation({unitOfWork:store.unitOfWork,eventPublisher:publisher});
 let id=1;
 for(let n=1;n<=50;n++){
   await record(randomUUID(),'1',event(id++));
   for(const target of [10,25,50]) assert.equal(store.progressOf('1').get(`id-favorite${target}`)?.achievedAt!=null,n>=target);
 }
 for(let n=0;n<9;n++)await record(randomUUID(),'1',event(id++,'hola','letters'));
 assert.equal(store.progressOf('1').get('id-both')?.achievedAt??null,null);
 await record(randomUUID(),'1',event(id++,'hola','letters'));
 assert.ok(store.progressOf('1').get('id-both')?.achievedAt);
 for(const [index,word] of [...RECOGNIZABLE_WORDS].slice(0,20).entries()){
   await record(randomUUID(),'2',event(id++,word));
   assert.equal(store.progressOf('2').get('id-distinct')?.achievedAt!=null,index===19);
 }
 assert.equal((await store.repositories.activity!.load('2')).words.hola??0,1);
 assert.ok(Math.max(...Object.values((await store.repositories.activity!.load('2')).words))<10);
});

it('all active-time levels, voice 25 and alphabet 10/27 cross their exact boundaries',async()=>{
 const levels=[600,3600,18000,36000,144000];
 const catalog=levels.map(n=>{const p=makeAchievement(`time${n}`,n);p.achievement.metric='ACTIVE_SECONDS';return p;});
 for(const n of [10,27]){const p=makeAchievement(`letters${n}`,n);p.achievement.metric='LETTERS_VIEWED';catalog.push(p);}
 const voice=makeAchievement('voice25',25);voice.achievement.metric='VOICE_COMPLETED';catalog.push(voice);
 const store=makeInMemoryStore(catalog);
 let now=100000;
 const record=makeRecordActivity({unitOfWork:store.unitOfWork,eventPublisher:publisher,now:()=>now});
 for(const target of levels){
   const state=await store.repositories.activity!.load('1');
   Object.assign(state,{session:sessionId,confirmedAt:now,lastTick:now,activeSeconds:target-1});
   await store.repositories.activity!.save('1',state);
   await record('1',{kind:'tick',sessionId});
   assert.equal(store.progressOf('1').get(`id-time${target}`)?.achievedAt??null,null);
   now+=1000;await record('1',{kind:'tick',sessionId});
   assert.ok(store.progressOf('1').get(`id-time${target}`)?.achievedAt);
 }
 for(const [index,code] of [...ALPHABET_CODES].entries()){
   await record('1',{kind:'letter',sessionId,code});
   for(const target of [10,27])assert.equal(store.progressOf('1').get(`id-letters${target}`)?.achievedAt!=null,index+1>=target);
 }
 const state=await store.repositories.activity!.load('1');state.translations=[1];await store.repositories.activity!.save('1',state);
 for(let n=1;n<=25;n++){
   const {playbackId}=await record('1',{kind:'voice-start',sessionId,translationId:1});
   now+=1000;await record('1',{kind:'voice-end',sessionId,playbackId});
   assert.equal(store.progressOf('1').get('id-voice25')?.achievedAt!=null,n===25);
 }
});

it('two sessions can finish their own voice playback without replacing or cancelling each other',async()=>{
 const store=makeInMemoryStore(catalog());let now=100000;
 const state=await store.repositories.activity!.load('1');state.translations=[1];await store.repositories.activity!.save('1',state);
 const record=makeRecordActivity({unitOfWork:store.unitOfWork,eventPublisher:publisher,now:()=>now});
 const otherSession='second-session-123456';
 const first=await record('1',{sessionId,kind:'voice-start',translationId:1});
 const second=await record('1',{sessionId:otherSession,kind:'voice-start',translationId:1});
 await record('1',{sessionId:otherSession,kind:'voice-cancel',playbackId:first.playbackId});
 now+=1000;
 await record('1',{sessionId,kind:'voice-end',playbackId:first.playbackId});
 await record('1',{sessionId:otherSession,kind:'voice-end',playbackId:second.playbackId});
 assert.equal((await store.repositories.activity!.load('1')).voice,2);
});
