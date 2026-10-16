import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { EventEnvelope, InMemoryEventBus } from '@traduce/shared';
import { subscribeToDomainEvents } from '../src/adapters/inbound/events/subscriptions';
import { makePostgresUsageEventRepository } from '../src/adapters/outbound/postgres/usage_event_repository';
import { makeEraseUserLink } from '../src/application/erase_user_link';
import { makeRecordEvent } from '../src/application/record_event';
import { makeIngestTranslationProduced, makeIngestUserRegistered } from '../src/application/ingest_events';
import { makeInMemoryUsageRepository } from './helpers/fakes';

const envelope = (eventId: string, type: string, payload: unknown): EventEnvelope => ({
  eventId, type, occurredAt: '2026-10-01T15:00:00Z', payload,
});
const deleted = (userId: unknown, eventId = 'd1') =>
  envelope(eventId, 'iam.UserDeleted', { userId, occurredAt: '2026-10-02T10:00:00.000Z' });
const registered = (userId: number, eventId = 'r1') =>
  envelope(eventId, 'iam.UserRegistered', { userId, email: 'a@b.co', name: 'Ada' });
const translation = (userId: number | null, eventId = 't1') =>
  envelope(eventId, 'recognition.TranslationProduced', {
    translationId: 9, userId, gloss: 'HOLA', text: 'Hola', occurredAt: '2026-10-01T15:00:00Z',
  });

describe('analytics: iam.UserDeleted', () => {
  test('desliga al usuario: user_id y la referencia USER pasan a null; los hechos se conservan', async () => {
    const repository = makeInMemoryUsageRepository();
    await makeIngestUserRegistered({ repository })(registered(5));
    await makeIngestTranslationProduced({ repository })(translation(5));
    await makeIngestTranslationProduced({ repository })(translation(6, 't2'));

    await makeEraseUserLink({ repository })(deleted(5));

    assert.equal(repository.events.length, 3);
    const [reg, mine, other] = repository.events;
    assert.deepEqual([reg.userId, reg.referenceType, reg.referenceId], [null, null, null]);
    assert.equal(mine.userId, null);
    assert.equal(mine.referenceType, 'TRANSLATION');
    assert.equal(other.userId, '6');
  });

  test('es idempotente', async () => {
    const repository = makeInMemoryUsageRepository();
    await makeIngestTranslationProduced({ repository })(translation(5));
    const handler = makeEraseUserLink({ repository });
    await handler(deleted(5));
    await handler(deleted(5, 'd2'));
    assert.equal(repository.events[0].userId, null);
    assert.deepEqual([...repository.erased], ['5']);
  });

  test('un UserRegistered tardio de un usuario borrado se ignora', async () => {
    const repository = makeInMemoryUsageRepository();
    await makeEraseUserLink({ repository })(deleted(5));
    await makeIngestUserRegistered({ repository })(registered(5));
    assert.equal(repository.events.length, 0);
    await makeIngestUserRegistered({ repository })(registered(6, 'r2'));
    assert.equal(repository.events.length, 1);
  });

  test('una traduccion tardia de un usuario borrado se guarda sin ligarla', async () => {
    const repository = makeInMemoryUsageRepository();
    await makeEraseUserLink({ repository })(deleted(5));
    await makeIngestTranslationProduced({ repository })(translation(5));
    assert.equal(repository.events[0].userId, null);
  });

  test('descarta con log un payload invalido', async () => {
    const repository = makeInMemoryUsageRepository();
    const original = console.error;
    const logged: string[] = [];
    console.error = (m: string) => { logged.push(m); };
    try {
      for (const userId of [0, -1, '5', null, 2.5]) await makeEraseUserLink({ repository })(deleted(userId));
    } finally {
      console.error = original;
    }
    assert.equal(logged.length, 5);
    assert.equal(repository.erased.size, 0);
  });

  test('la suscripcion recibe iam.UserDeleted del bus', async () => {
    const repository = makeInMemoryUsageRepository();
    const bus = new InMemoryEventBus();
    await subscribeToDomainEvents({ subscriber: bus, repository });
    await bus.publish('iam.UserRegistered', { userId: 5, email: 'a@b.co', name: 'Ada' });
    await bus.publish('iam.UserDeleted', { userId: 5, occurredAt: '2026-10-02T10:00:00.000Z' });
    assert.equal(repository.events[0].userId, null);
  });

  test('adaptador Postgres: marca borrado y desliga en una transaccion; ROLLBACK si falla', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    let failOn: RegExp | null = null;
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (failOn?.test(sql)) throw new Error('fallo simulado');
        return { rows: [] };
      },
      release: () => undefined,
    };
    const repository = makePostgresUsageEventRepository({ connect: async () => client } as unknown as Pool);

    await repository.unlinkUser('5');
    const sqls = queries.map(q => q.sql);
    assert.equal(sqls[0], 'BEGIN');
    assert.equal(sqls.at(-1), 'COMMIT');
    assert.match(sqls.join('\n'), /INSERT INTO erased_users/);
    assert.match(sqls.join('\n'), /SET reference_type = NULL, reference_id = NULL WHERE reference_type = 'USER' AND reference_id = \$1/);
    assert.match(sqls.join('\n'), /UPDATE usage_event SET user_id = NULL, session_id = NULL WHERE user_id = \$1/);

    queries.length = 0;
    failOn = /^UPDATE usage_event SET user_id/;
    await assert.rejects(repository.unlinkUser('5'), /fallo simulado/);
    assert.equal(queries.at(-1)?.sql, 'ROLLBACK');
  });
});

describe('analytics: POST /events de un usuario borrado o con referencia USER', () => {
  const input = { userId: 5, section: 'HOME', eventType: 'SECTION_VIEW' };

  test('un usuario borrado con JWT vigente recibe ACCOUNT_DELETED (401) y no se guarda nada', async () => {
    const repository = makeInMemoryUsageRepository();
    await makeEraseUserLink({ repository })(deleted(5));
    const record = makeRecordEvent({ repository });
    await assert.rejects(record(input), (error: Error & { httpStatus?: number; code?: string }) =>
      error.httpStatus === 401 && error.code === 'ACCOUNT_DELETED');
    assert.equal(repository.events.length, 0);
    await record({ ...input, userId: 6 });
    assert.equal(repository.events.length, 1);
  });

  test('un cliente no puede enviar referenceType USER', async () => {
    const repository = makeInMemoryUsageRepository();
    const record = makeRecordEvent({ repository });
    await assert.rejects(
      record({ ...input, referenceType: 'USER', referenceId: '3f2b8c1e-5d4a-4b6c-9e7f-1a2b3c4d5e6f' }),
      /referenceType debe ser uno de/,
    );
  });

  test('desligar al usuario tambien limpia session_id', async () => {
    const repository = makeInMemoryUsageRepository();
    await repository.save({
      eventId: 'x', userId: '5', sessionId: 'sesion', section: 'HOME', eventType: 'SECTION_VIEW',
      referenceType: null, referenceId: null, signCodes: [], createdAt: new Date(),
    });
    await makeEraseUserLink({ repository })(deleted(5));
    assert.equal(repository.events[0].sessionId, null);
  });
});
