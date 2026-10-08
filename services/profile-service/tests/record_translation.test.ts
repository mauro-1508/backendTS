import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EventPublisher } from '@traduce/shared';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makeRegisterUserProfile } from '../src/application/register_user_profile';
import { makeListAchievements } from '../src/application/list_achievements';
import { makeInMemoryStore, makeAchievement } from './in_memory';

const USER = 'user-1';

const setup = (targets: number[] = [1, 3]) => {
  const store = makeInMemoryStore(
    targets.map(target => makeAchievement(`T${target}`, target)),
  );

  const published: string[] = [];
  const eventPublisher: EventPublisher = {
    publish: async type => {
      published.push(type);
    },
  };

  const record = makeRecordTranslation({
    unitOfWork: store.unitOfWork,
    eventPublisher,
  });

  return { store, published, record };
};

describe('registrar traduccion y desbloquear logros', () => {
  it('espera el bloqueo del usuario antes de consultar el progreso', async () => {
    const { store, record } = setup([3]);
    const calls: string[] = [];
    let lockAcquired = false;

    store.repositories.gamificationLocks.lockUser = async userId => {
      assert.equal(userId, USER);
      calls.push('lock:start');

      await new Promise<void>(resolve => setImmediate(resolve));

      lockAcquired = true;
      calls.push('lock:acquired');
    };

    const originalFind =
      store.repositories.achievements.findProgressByMetric;

    store.repositories.achievements.findProgressByMetric =
      async (userId, metric) => {
        assert.equal(
          lockAcquired,
          true,
          'Debe esperar el bloqueo antes de consultar el progreso',
        );
        calls.push('findProgress');
        return originalFind(userId, metric);
      };

    await record('lock-order-event', USER);

    assert.deepEqual(calls, [
      'lock:start',
      'lock:acquired',
      'findProgress',
    ]);
  });

  it('desbloquea un logro al alcanzar su meta y crea la notificacion', async () => {
    const { store, record, published } = setup();
    const unlocked = await record('e1', USER);

    assert.deepEqual(unlocked.map(u => u.achievement.code), ['T1']);
    assert.equal(store.notifications.length, 1);
    assert.equal(store.notifications[0].referenceType, 'ACHIEVEMENT');
    assert.deepEqual(published, ['profile.AchievementUnlocked']);
  });

  it('desbloquea cada logro una sola vez aunque lleguen mas traducciones', async () => {
    const { store, record } = setup();
    await record('e1', USER);
    await record('e2', USER);
    const third = await record('e3', USER);
    const fourth = await record('e4', USER);

    assert.deepEqual(third.map(u => u.achievement.code), ['T3']);
    assert.deepEqual(fourth, []);
    assert.equal(store.notifications.length, 2);
  });

  it('ERF8.2: con notificaciones apagadas desbloquea el logro pero no notifica', async () => {
    const { store, record } = setup();
    store.preferencesByUser.set(USER, {
      uiLanguage: 'ES',
      theme: 'LIGHT',
      notificationsEnabled: false,
    });

    const unlocked = await record('e1', USER);

    assert.equal(unlocked.length, 1);
    assert.equal(store.notifications.length, 0);
    assert.notEqual(
      store.progressOf(USER).get('id-T1')?.achievedAt,
      null,
    );
  });

  it('es idempotente: el mismo eventId no cuenta dos veces', async () => {
    const { store, record } = setup([2]);
    await record('same', USER);
    const replay = await record('same', USER);

    assert.deepEqual(replay, []);
    assert.equal(store.progressOf(USER).get('id-T2')?.currentCount, 1);
  });

  it('lista logros desbloqueados y bloqueados con su progreso', async () => {
    const { store, record } = setup();
    await record('e1', USER);
    const list = await makeListAchievements({
      achievements: store.repositories.achievements,
    })(USER);

    assert.equal(list.length, 2);
    assert.notEqual(list[0].achievedAt, null);
    assert.equal(list[1].achievedAt, null);
    assert.equal(list[1].currentCount, 1);
  });

  it('oculta nombre y descripcion de un logro secreto bloqueado', async () => {
    const store = makeInMemoryStore([
      makeAchievement('SECRET', 5, true),
    ]);
    const [secret] = await makeListAchievements({
      achievements: store.repositories.achievements,
    })(USER);

    assert.equal(secret.achievement.name, '???');
  });
});

describe('crear perfil al registrarse', () => {
  it('crea preferencias por defecto una sola vez aunque el evento se repita', async () => {
    const store = makeInMemoryStore([]);
    const register = makeRegisterUserProfile({
      unitOfWork: store.unitOfWork,
    });

    await register('evt', { userId: USER, email: 'a@b.co' });
    await register('evt', { userId: USER, email: 'a@b.co' });
    await register('evt-2', { userId: USER });

    assert.deepEqual(store.createdProfiles, [USER]);
    assert.equal(
      store.preferencesByUser.get(USER)?.notificationsEnabled,
      true,
    );
  });
});