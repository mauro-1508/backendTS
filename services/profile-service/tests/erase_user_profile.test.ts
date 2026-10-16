import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryEventBus } from '@traduce/shared';
import { subscribeToEvents } from '../src/adapters/inbound/events/subscriptions';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makeEraseUserProfile } from '../src/application/erase_user_profile';
import { makeRegisterUserProfile } from '../src/application/register_user_profile';
import { makePostgresProfileRepository } from '../src/adapters/outbound/postgres/postgres_repositories';
import { makeAchievement, makeInMemoryStore } from './in_memory';

const setup = () => {
  const store = makeInMemoryStore([makeAchievement('T1', 1)]);
  return {
    store,
    register: makeRegisterUserProfile({ unitOfWork: store.unitOfWork }),
    erase: makeEraseUserProfile({ unitOfWork: store.unitOfWork }),
  };
};

describe('borrado de perfil (iam.UserDeleted)', () => {
  it('borra los datos del usuario y respeta los de otros', async () => {
    const { store, register, erase } = setup();
    await register('r1', { userId: '7' });
    await register('r2', { userId: '8' });
    store.notifications.push({ userId: '7', typeCode: 'X', title: 't', body: 'b' });
    store.notifications.push({ userId: '8', typeCode: 'X', title: 't', body: 'b' });

    await erase('d1', '7');

    assert.equal(store.preferencesByUser.has('7'), false);
    assert.equal(store.preferencesByUser.has('8'), true);
    assert.deepEqual(store.notifications.map(n => n.userId), ['8']);
    assert.ok(store.erasedUsers.has('7'));
  });

  it('un UserRegistered tardio no recrea el perfil de un usuario borrado', async () => {
    const { store, register, erase } = setup();
    await erase('d1', '7');
    await register('r-late', { userId: '7' });
    assert.equal(store.preferencesByUser.has('7'), false);
    assert.deepEqual(store.createdProfiles, []);
  });

  it('una TranslationProduced tardia no recrea logros ni notificaciones de un usuario borrado', async () => {
    const store = makeInMemoryStore([makeAchievement('T1', 1)]);
    const published: string[] = [];
    const record = makeRecordTranslation({
      unitOfWork: store.unitOfWork,
      eventPublisher: { publish: async type => { published.push(type); } },
    });
    await makeEraseUserProfile({ unitOfWork: store.unitOfWork })('d1', '7');

    assert.deepEqual(await record('t-late', '7'), []);
    assert.equal(store.notifications.length, 0);
    assert.equal(store.progressOf('7').size, 0);
    assert.deepEqual(published, []);
    assert.equal((await record('t-other', '8')).length, 1);
  });

  it('es idempotente por eventId', async () => {
    const { store, erase } = setup();
    let calls = 0;
    const original = store.repositories.profiles.eraseUser;
    store.repositories.profiles.eraseUser = async userId => { calls++; await original(userId); };
    await erase('d1', '7');
    await erase('d1', '7');
    assert.equal(calls, 1);
  });

  it('la suscripcion entrega UserDeleted valido como texto y descarta el invalido', async () => {
    const bus = new InMemoryEventBus();
    const erased: string[] = [];
    await subscribeToEvents(bus, {
      eraseUserProfile: async (_eventId: string, userId: string) => { erased.push(userId); },
    } as never);
    const originalError = console.error;
    console.error = () => {};
    try {
      await bus.publish('iam.UserDeleted', { userId: 7, occurredAt: '2026-10-02T10:00:00.000Z' });
      await bus.publish('iam.UserDeleted', { userId: '7', occurredAt: '2026-10-02T10:00:00.000Z' });
      await bus.publish('iam.UserDeleted', { userId: -1, occurredAt: '2026-10-02T10:00:00.000Z' });
      await bus.publish('iam.UserDeleted', {});
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(erased, ['7']);
  });

  it('adaptador Postgres: borra las 4 tablas, registra erased_users y createIfAbsent lo respeta', async () => {
    const queries: string[] = [];
    let isErased = false;
    const db = {
      query: async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
        return { rows: /FROM erased_users/.test(sql) && isErased ? [{}] : [], rowCount: 0 };
      },
    };
    const repository = makePostgresProfileRepository(db as never);

    await repository.eraseUser('7');
    const body = queries.join('\n');
    for (const table of ['user_achievements', 'notifications', 'user_preferences', 'user_profiles']) {
      assert.match(body, new RegExp(`DELETE FROM ${table} WHERE user_id = \\$1`));
    }
    assert.match(body, /INSERT INTO erased_users/);

    queries.length = 0;
    isErased = true;
    await repository.createIfAbsent({ userId: '7' });
    assert.equal(queries.length, 1);
    assert.match(queries[0], /FROM erased_users/);
  });
});
