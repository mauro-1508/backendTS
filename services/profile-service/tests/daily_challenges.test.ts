import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { TranslationProduced } from '@traduce/shared';
import { bogotaDate, ChallengeDefinition, selectChallenge } from '../src/domain/challenge';
import { makeGetTodayChallenge } from '../src/application/daily_challenge';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makeEraseUserProfile } from '../src/application/erase_user_profile';
import { DEFAULT_PREFERENCES, UiLanguage } from '../src/domain/preferences';
import { makeAchievement, makeInMemoryStore } from './in_memory';

const now = () => new Date('2026-10-25T12:00:00Z');
const challengeDefinition = (targetCount = 3): ChallengeDefinition => ({
  challengeId: randomUUID(), code: 'TRANSLATE_3', name: 'Guardadas', description: 'Traducciones guardadas y confirmadas',
  targetCount, points: 10, localizations: {
    es: { name: 'Guardadas', description: 'Confirmadas' }, en: { name: 'Saved', description: 'Confirmed' },
    fr: { name: 'Enregistrées', description: 'Confirmées' }, pt: { name: 'Salvas', description: 'Confirmadas' },
  },
});
const translationEvent = (translationId: number, occurredAt = '2026-10-25T12:00:00Z'): TranslationProduced => ({
  userId: 1, translationId, gloss: 'buenas noches', text: 'buenas noches', occurredAt, eligible: true,
});
const setup = (target = 3) => {
  const store = makeInMemoryStore([makeAchievement('FIRST_TRANSLATION', 1), makeAchievement('THREE', 3)]);
  store.challenges.push(challengeDefinition(target));
  const record = makeRecordTranslation({ unitOfWork: store.unitOfWork, eventPublisher: { publish: async () => {} } });
  const read = makeGetTodayChallenge({ unitOfWork: store.unitOfWork, now });
  return { store, record, read };
};

it('selección por código y días desde epoch, independiente del orden; no muta catálogo', () => {
  const definitions = ['TRANSLATE_8','TRANSLATE_1','TRANSLATE_5','TRANSLATE_3'].map(code => ({ ...challengeDefinition(), code }));
  assert.equal(selectChallenge(definitions, '1970-01-01')!.code, 'TRANSLATE_1');
  assert.equal(selectChallenge(definitions, '1970-01-02')!.code, 'TRANSLATE_3');
  assert.equal(selectChallenge(definitions, '1970-01-03')!.code, 'TRANSLATE_5');
  assert.equal(selectChallenge(definitions, '1970-01-04')!.code, 'TRANSLATE_8');
  assert.equal(selectChallenge(definitions, '1970-01-05')!.code, 'TRANSLATE_1');
  assert.equal(definitions[0].code, 'TRANSLATE_8');
  assert.equal(selectChallenge([], '2026-10-25'), null);
});
it('frontera de medianoche en Bogotá, cambio de mes y año', () => {
  assert.equal(bogotaDate(new Date('2026-10-25T04:59:59.999Z')), '2026-10-24');
  assert.equal(bogotaDate(new Date('2026-10-25T05:00:00Z')), '2026-10-25');
  assert.equal(bogotaDate(new Date('2027-01-01T04:59:59Z')), '2026-12-31');
  assert.equal(bogotaDate(new Date('2026-11-01T05:00:00Z')), '2026-11-01');
});
it('GET con progreso cero no escribe asignación, perfil, recibo ni evento; mismo reto para usuarios', async () => {
  const { store, read } = setup();
  store.repositories.challenges.save = async () => assert.fail('Lectura no debe guardar');
  store.repositories.processedEvents.markIfNew = async () => assert.fail('Lectura no procesa eventos');
  store.repositories.profiles.createIfAbsent = async () => assert.fail('Lectura no debe crear perfiles');
  const first = await read('1');
  assert.deepEqual(first, await read('2'));
  assert.equal(first.data!.currentCount, 0);
  assert.equal(first.data!.completed, false);
  assert.equal(first.data!.completedAt, null);
  assert.equal(store.assignments.size, 0);
});
it('sin retos activos responde success/data:null', async () => {
  const { store, read } = setup(); store.challenges.length = 0;
  assert.deepEqual(await read('1'), { success: true, data: null, message: 'No hay retos activos para hoy' });
});
it('una frase guardada cuenta una vez; umbral, recompensa y aviso únicos; preserva logros', async () => {
  const { store, record, read } = setup();
  await record('event1', '1', translationEvent(1));
  assert.equal((await read('1')).data!.currentCount, 1);
  assert.equal(store.rewards.size, 0);
  assert.ok(store.progressOf('1').get('id-FIRST_TRANSLATION')!.achievedAt);
  await record('event1', '1', translationEvent(2)); // Mismo sobre.
  await record('other-envelope', '1', translationEvent(1)); // Misma traducción.
  assert.equal((await read('1')).data!.currentCount, 1);
  await record('event2', '1', translationEvent(2));
  await record('event3', '1', translationEvent(3));
  const completed = (await read('1')).data!;
  assert.equal(completed.currentCount, 3);
  assert.equal(completed.completedAt, '2026-10-25T12:00:00.000Z');
  assert.equal(completed.completed, true);
  assert.equal(store.rewards.size, 1);
  assert.equal([...store.rewards.values()][0].points, 10);
  const notice = store.notifications.filter(n => n.typeCode === 'CHALLENGE_COMPLETED');
  assert.equal(notice.length, 1); assert.equal(notice[0].referenceType, 'CHALLENGE');
  assert.equal(notice[0].referenceId, [...store.assignments.values()][0].assignmentId);
  await record('event4', '1', translationEvent(4));
  assert.deepEqual((await read('1')).data, completed);
  assert.equal(store.rewards.size, 1);
  assert.equal(store.notifications.filter(n => n.typeCode === 'CHALLENGE_COMPLETED').length, 1);
  assert.ok(store.progressOf('1').get('id-THREE')!.achievedAt);
});
it('mantiene identidad, meta y puntos de la asignación al cambiar o desactivar el catálogo', async () => {
  const { store, record, read } = setup();
  await record('e1', '1', translationEvent(1));
  const original = (await read('1')).data!;
  store.challenges[0] = { ...challengeDefinition(8), points: 999 };
  assert.deepEqual((await read('1')).data, original);
  store.challenges.length = 0;
  await record('e2', '1', translationEvent(2));
  await record('e3', '1', translationEvent(3));
  assert.equal((await read('1')).data!.points, 10);
  assert.equal([...store.rewards.values()][0].points, 10);
});
it('eventos de otro día avanzan solo ese día y aíslan usuarios', async () => {
  const { store, record, read } = setup();
  await record('yesterday', '1', translationEvent(1, '2026-10-25T04:59:59Z'));
  assert.equal((await read('1')).data!.currentCount, 0);
  assert.equal(store.assignments.get('1:2026-10-24')!.currentCount, 1);
  await record('today', '1', translationEvent(2, '2026-10-25T05:00:00Z'));
  assert.equal((await read('1')).data!.currentCount, 1);
  assert.equal((await read('2')).data!.currentCount, 0);
});
it('avisos desactivados permiten completar y otorgar puntos', async () => {
  const { store, record, read } = setup(1);
  store.preferencesByUser.set('1', { ...DEFAULT_PREFERENCES, notificationsEnabled: false });
  await record('e1','1',translationEvent(1));
  assert.equal((await read('1')).data!.completed, true);
  assert.equal(store.rewards.size, 1); assert.equal(store.notifications.length, 0);
});
for (const language of ['ES','EN','FR','PT'] as UiLanguage[]) it(`localiza API y aviso en ${language}`, async () => {
  const { store, record, read } = setup(1);
  store.preferencesByUser.set('1', { ...DEFAULT_PREFERENCES, uiLanguage: language });
  await record('e1','1',translationEvent(1));
  const text = store.challenges[0].localizations[language.toLowerCase() as Lowercase<UiLanguage>]!;
  assert.equal((await read('1')).data!.name, text.name);
  assert.ok(store.notifications.find(n => n.typeCode === 'CHALLENGE_COMPLETED')!.title.includes(text.name));
});
it('borrado elimina progreso, puntos y avisos; GET y eventos tardíos no recrean datos', async () => {
  const { store, record, read } = setup(1);
  await record('e1', '1', translationEvent(1));
  await makeEraseUserProfile({ unitOfWork: store.unitOfWork })('erase','1');
  await record('late','1',translationEvent(2));
  assert.equal((await read('1')).data, null);
  assert.equal(store.assignments.size, 0); assert.equal(store.rewards.size, 0);
  assert.equal(store.notifications.length, 0); assert.equal(store.challenges.length, 1);
  assert.equal(store.erasedUsers.has('1'), true);
});
it('sin elegibilidad no crea progreso ni puntos; payload antiguo conserva compatibilidad', async () => {
  const { store, record } = setup(1);
  await record('ineligible','1',{ ...translationEvent(1), eligible: false });
  assert.equal(store.assignments.size, 0);
  await record('legacy','1',{ ...translationEvent(2), eligible: undefined });
  assert.equal(store.rewards.size, 1);
});
it('bloqueo y deduplicación de traducción preceden al reto; no usa segundo processEventOnce', async () => {
  const { store, record } = setup(); const order: string[] = [];
  store.repositories.gamificationLocks.lockUser = async () => { order.push('lock'); };
  const receipt = store.repositories.activity!.recordTranslationIfNew;
  store.repositories.activity!.recordTranslationIfNew = async (...args) => { order.push('receipt'); return receipt(...args); };
  const find = store.repositories.challenges.findAssignment;
  store.repositories.challenges.findAssignment = async (...args) => { order.push('challenge'); return find(...args); };
  await record('e1','1',translationEvent(1));
  assert.deepEqual(order, ['lock','receipt','challenge']);
  assert.equal(store.assignments.size, 1);
});
