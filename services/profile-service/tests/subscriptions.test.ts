import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  EventEnvelope,
  EventHandler,
  InMemoryEventBus,
  TranslationProduced,
} from '@traduce/shared';
import { publishUserRegistered } from '../../iam-service/src/auth/application/publish_registered';
import { subscribeToEvents } from '../src/adapters/inbound/events/subscriptions';
import {
  makePostgresProfileRepository,
  Queryable,
} from '../src/adapters/outbound/postgres/postgres_repositories';
import { makeRegisterUserProfile } from '../src/application/register_user_profile';
import { NewProfile } from '../src/ports/repositories';
import { makeInMemoryStore } from './in_memory';

const validTranslation = (): TranslationProduced => ({
  translationId: 15,
  userId: 7,
  gloss: 'HOLA',
  text: 'Hola',
  occurredAt: '2026-10-10T12:00:00.000Z',
});

describe('suscripciones a eventos', () => {
  it('convierte userId a texto y mapea name a fullName', async () => {
    const bus = new InMemoryEventBus();
    const translatedBy: string[] = [];
    const registered: NewProfile[] = [];

    await subscribeToEvents(bus, {
      eraseUserProfile: async () => {},
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
    await bus.publish(
      'recognition.TranslationProduced',
      validTranslation(),
    );

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
      eraseUserProfile: async () => {},
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

    // Comprueba las inserciones por su contenido, sin depender del número
    // de consultas previas que protegen contra cuentas eliminadas.
    const profileInserts = queries.filter(query =>
      /INSERT INTO user_profiles \(user_id, email, full_name, username\)/
        .test(query.text),
    );
    const preferenceInserts = queries.filter(query =>
      /INSERT INTO user_preferences/.test(query.text),
    );

    // El registro debe consultar la marca de eliminación.
    assert.ok(
      queries.some(query => /FROM erased_users/.test(query.text)),
    );

    // El nombre publicado por IAM debe llegar intacto al perfil.
    assert.equal(profileInserts.length, 1);
    assert.deepEqual(
      profileInserts[0].values,
      ['7', 'a@b.co', 'Ada Lovelace', null],
    );

    // Las preferencias deben crearse para el mismo usuario.
    assert.equal(preferenceInserts.length, 1);
    assert.deepEqual(preferenceInserts[0].values, ['7']);
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

  it('entrega el eventId original y el userId como texto', async () => {
    const subscriptions = new Map<string, EventHandler>();
    const calls: Array<{ eventId: string; userId: string }> = [];

    await subscribeToEvents({
      subscribe: async (subscription, handler) => {
        subscriptions.set(subscription.pattern, handler);
      },
    }, {
      eraseUserProfile: async () => {},
      registerUserProfile: async () => {},
      recordTranslation: async (eventId, userId) => {
        calls.push({ eventId, userId });
        return [];
      },
    });

    const event: EventEnvelope = {
  eventId: randomUUID(),
  type: 'recognition.TranslationProduced',
  occurredAt: '2026-10-10T12:00:00.000Z',
  payload: validTranslation(),
};
    const handler = subscriptions.get(event.type);
    assert.ok(handler);

    await handler(event);

    assert.deepEqual(calls, [{
      eventId: event.eventId,
      userId: '7',
    }]);
  });

  it('ignora traducciones anonimas validas sin llamar al caso de uso', async t => {
    const bus = new InMemoryEventBus();
    const logs = t.mock.method(console, 'error', () => {});
    let calls = 0;

    await subscribeToEvents(bus, {
      eraseUserProfile: async () => {},
      registerUserProfile: async () => {},
      recordTranslation: async () => {
        calls += 1;
        return [];
      },
    });

    await bus.publish('recognition.TranslationProduced', {
      ...validTranslation(),
      userId: null,
    });

    assert.equal(calls, 0);
    assert.equal(logs.mock.callCount(), 0);
  });

  it('descarta payloads invalidos y sigue aceptando eventos validos', async t => {
    const bus = new InMemoryEventBus();
    const logs = t.mock.method(console, 'error', () => {});
    const translatedBy: string[] = [];
    const valid = validTranslation();
    const invalidPayloads: unknown[] = [
      null,
      undefined,
      [],
      'invalid',
      {},
      { userId: 7, gloss: 'HOLA' },
      { ...valid, translationId: undefined },
      { ...valid, translationId: 0 },
      { ...valid, translationId: '15' },
      { ...valid, userId: undefined },
      { ...valid, userId: '7' },
      { ...valid, userId: 0 },
      { ...valid, userId: -1 },
      { ...valid, userId: 1.5 },
      { ...valid, gloss: undefined },
      { ...valid, gloss: 123 },
      { ...valid, text: undefined },
      { ...valid, text: null },
      { ...valid, occurredAt: undefined },
      { ...valid, occurredAt: 'invalid-date' },
      { ...valid, userId: null, translationId: 0 },
    ];

    await subscribeToEvents(bus, {
      eraseUserProfile: async () => {},
      registerUserProfile: async () => {},
      recordTranslation: async (_eventId, userId) => {
        translatedBy.push(userId);
        return [];
      },
    });

    for (const payload of invalidPayloads) {
      await bus.publish('recognition.TranslationProduced', payload);
    }

    assert.deepEqual(translatedBy, []);
    assert.equal(logs.mock.callCount(), invalidPayloads.length);

    await bus.publish('recognition.TranslationProduced', valid);

    assert.deepEqual(translatedBy, ['7']);
    assert.equal(logs.mock.callCount(), invalidPayloads.length);
  });

  it('propaga el mismo error del caso de uso', async () => {
    const bus = new InMemoryEventBus();
    const expectedError = new Error('fallo al guardar progreso');

    await subscribeToEvents(bus, {
      eraseUserProfile: async () => {},
      registerUserProfile: async () => {},
      recordTranslation: async () => {
        throw expectedError;
      },
    });

    await assert.rejects(
      bus.publish('recognition.TranslationProduced', validTranslation()),
      error => error === expectedError,
    );
  });
});