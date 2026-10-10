import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryEventBus } from '@traduce/shared';
import { publishUserRegistered } from '../../iam-service/src/auth/application/publish_registered';
import { subscribeToEvents } from '../src/adapters/inbound/events/subscriptions';
import {
  makePostgresProfileRepository,
  Queryable,
} from '../src/adapters/outbound/postgres/postgres_repositories';
import { makeRegisterUserProfile } from '../src/application/register_user_profile';
import { NewProfile } from '../src/ports/repositories';
import { makeInMemoryStore } from './in_memory';

describe('suscripciones a eventos', () => {
  it('convierte userId a texto y mapea name a fullName', async () => {
    const bus = new InMemoryEventBus();
    const translatedBy: string[] = [];
    const registered: NewProfile[] = [];

    await subscribeToEvents(bus, {
      registerUserProfile: async (_eventId, profile) => {
        registered.push(profile);
      },
      recordTranslation: async (_eventId, userId) => {
        translatedBy.push(userId);
        return [];
      },
    });

    await bus.publish('iam.UserRegistered', {
      userId: 7,
      email: 'a@b.co',
      name: 'Ada',
    });
    await bus.publish('recognition.TranslationProduced', {
      userId: 7,
      gloss: 'HOLA',
    });

    assert.deepEqual(registered, [{
      userId: '7',
      email: 'a@b.co',
      fullName: 'Ada',
    }]);
    assert.deepEqual(translatedBy, ['7']);
  });

  it('lleva el nombre del productor IAM al INSERT de full_name', async () => {
    const bus = new InMemoryEventBus();
    const store = makeInMemoryStore([]);
    const queries: Array<{ text: string; values?: unknown[] }> = [];

    const db: Queryable = {
      async query(text, values) {
        queries.push({ text, values });
        return { rows: [], rowCount: 1 };
      },
    };

    store.repositories.profiles = makePostgresProfileRepository(db);

    await subscribeToEvents(bus, {
      registerUserProfile: makeRegisterUserProfile({
        unitOfWork: store.unitOfWork,
      }),
      recordTranslation: async () => [],
    });

    await publishUserRegistered(bus, {
      userId: 7,
      email: 'a@b.co',
      name: 'Ada Lovelace',
    });

    assert.equal(queries.length, 2);
    assert.match(
      queries[0].text,
      /INSERT INTO user_profiles \(user_id, email, full_name, username\)/,
    );
    assert.deepEqual(
      queries[0].values,
      ['7', 'a@b.co', 'Ada Lovelace', null],
    );
    assert.match(queries[1].text, /INSERT INTO user_preferences/);
    assert.deepEqual(queries[1].values, ['7']);
  });

  it('no vuelve a crear el perfil al repetir el mismo eventId', async () => {
    const store = makeInMemoryStore([]);
    const created: NewProfile[] = [];

    store.repositories.profiles.createIfAbsent = async profile => {
      created.push(profile);
    };

    const register = makeRegisterUserProfile({
      unitOfWork: store.unitOfWork,
    });
    const profile: NewProfile = {
      userId: '7',
      email: 'a@b.co',
      fullName: 'Ada Lovelace',
    };

    await register('same-registration-event', profile);
    await register('same-registration-event', profile);

    assert.deepEqual(created, [profile]);
  });
});
