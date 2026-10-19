import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { EVENT_TYPES, InMemoryEventBus } from '@traduce/shared';
import { makeUnlinkUserSamples } from '../src/samples/application/unlink_user_samples';
import { makeEraseUserTranslations } from '../src/translations/application/erase_user_translations';
import { makePostgresTranslationRepository } from '../src/translations/adapters/outbound/postgres/translation_repository';
import { InMemorySampleRepository } from '../src/samples/adapters/outbound/memory/in_memory_sample_repository';
import { makeMongoSampleRepository, SampleDocument } from '../src/samples/adapters/outbound/mongo/mongo_sample_repository';
import { makeEraseAccountData } from '../src/accounts/application/erase_account_data';
import { makeUserDeletedHandler, subscribeToUserDeleted, USER_DELETED_QUEUE } from '../src/accounts/adapters/inbound/events/user_deleted_subscriber';
import { TranslationRepository } from '../src/translations/ports/outbound/translation_repository';
import { AccountErasedError } from '../src/common/domain/errors';
import { makeTranslationController } from '../src/translations/adapters/inbound/http/translation_controller';
import { makeCreateTranslation } from '../src/translations/application/create_translation';
import { Translation } from '../src/translations/domain/entity';

const sample = (recordedBy: number, signCode = 'HOLA') => ({
  signCode, captureSessionId: 's1', recordedBy, performedBy: 'Ana', consentGrantedAt: new Date(),
  consentTermsVersion: 'v1', frames: [[0.1]],
});

const fakeTranslations = (userIds: Array<number | null>) => {
  let rows = [...userIds];
  const erased = new Set<number>();
  const repository: TranslationRepository = {
    create: async input => {
      if (input.userId != null && erased.has(input.userId)) throw new AccountErasedError();
      rows.push(input.userId ?? null);
      return { translationId: rows.length, userId: input.userId ?? null, createdAt: new Date() } as Translation;
    },
    listByUser: async () => [],
    softDelete: async () => null,
    eraseUser: async userId => {
      erased.add(userId);
      const before = rows.length;
      rows = rows.filter(id => id !== userId);
      return before - rows.length;
    },
  };
  return { repository, remaining: () => rows, erased };
};

const validEvent = (userId: unknown) => ({
  eventId: 'e1', type: EVENT_TYPES.UserDeleted, occurredAt: '2026-10-01T10:00:00.000Z',
  payload: { userId, occurredAt: '2026-10-01T10:00:00.000Z' },
});

describe('recognition: iam.UserDeleted', () => {
  test('borra traducciones y CONSERVA las muestras desligando al operador (recorded_by = null)', async () => {
    const translations = fakeTranslations([7, 7, 8, null]);
    const sampleRepository = new InMemorySampleRepository();
    await sampleRepository.create(sample(7));
    await sampleRepository.create(sample(8));
    const logs: string[] = [];
    const handler = makeUserDeletedHandler({
      eraseAccountData: makeEraseAccountData({
        eraseTranslations: makeEraseUserTranslations({ translationRepository: translations.repository }),
        unlinkSamples: makeUnlinkUserSamples({ sampleRepository }),
      }),
      log: m => logs.push(m),
    });

    await handler(validEvent(7));

    assert.deepEqual(translations.remaining(), [8, null]);
    const left = await sampleRepository.list({});
    assert.equal(left.length, 2);
    assert.deepEqual(left.map(s => s.recordedBy), [null, 8]);
    assert.equal(logs[0], '[recognition] limpieza completada: 2 traduccion(es), 1 muestra(s)');
  });

  test('es idempotente: repetir el evento no falla ni cambia mas', async () => {
    const translations = fakeTranslations([7, 8]);
    const sampleRepository = new InMemorySampleRepository();
    await sampleRepository.create(sample(8));
    const handler = makeUserDeletedHandler({
      eraseAccountData: makeEraseAccountData({
        eraseTranslations: makeEraseUserTranslations({ translationRepository: translations.repository }),
        unlinkSamples: makeUnlinkUserSamples({ sampleRepository }),
      }),
      log: () => {},
    });
    await handler(validEvent(7));
    await handler(validEvent(7));
    assert.deepEqual(translations.remaining(), [8]);
    assert.equal((await sampleRepository.list({})).length, 1);
  });

  test('descarta un payload invalido sin borrar nada', async () => {
    let calls = 0;
    const logs: string[] = [];
    const handler = makeUserDeletedHandler({
      eraseAccountData: makeEraseAccountData({
        eraseTranslations: async () => { calls++; return 0; },
        unlinkSamples: async () => { calls++; return 0; },
      }),
    });
    const original = console.error;
    console.error = (m: string) => logs.push(m);
    try {
      for (const userId of [0, -3, '7', null, 1.5]) await assert.rejects(handler(validEvent(userId)));
      await assert.rejects(handler({ ...validEvent(7), payload: { userId: 7 } }));
    } finally {
      console.error = original;
    }
    assert.equal(calls, 0);
    assert.equal(logs.length, 6);
  });

  test('un error de base de datos se propaga (tras reintentos, el bus lo manda a la cola muerta)', async () => {
    const handler = makeUserDeletedHandler({
      eraseAccountData: makeEraseAccountData({
        eraseTranslations: async () => { throw new Error('db caida'); },
        unlinkSamples: async () => 0,
      }),
    });
    await assert.rejects(handler(validEvent(7)), /db caida/);
  });

  test('la suscripcion usa cola propia, reintenta errores pasajeros y entrega el evento', async () => {
    const bus = new InMemoryEventBus();
    const queues: string[] = [];
    const spy = { subscribe: async (s: { queue: string; pattern: string }, h: never) => { queues.push(s.queue + '|' + s.pattern); return bus.subscribe(s, h); } };
    let calls = 0;
    await subscribeToUserDeleted(spy, async () => { if (++calls < 2) throw new Error('pasajero'); }, {
      sleep: async () => {}, log: () => {},
    });
    await bus.publish(EVENT_TYPES.UserDeleted, { userId: 7, occurredAt: '2026-10-01T10:00:00.000Z' });
    assert.deepEqual(queues, [USER_DELETED_QUEUE + '|iam.UserDeleted']);
    assert.equal(calls, 2);
  });
});

describe('recognition: usuario borrado no puede recrear traducciones', () => {
  test('create rechaza con AccountErasedError tras eraseUser; otros usuarios y anonimos siguen', async () => {
    const translations = fakeTranslations([]);
    const create = makeCreateTranslation({ translationRepository: translations.repository, eventPublisher: new InMemoryEventBus() });
    await makeEraseUserTranslations({ translationRepository: translations.repository })(7);
    const input = { outputText: 'hola', type: 'sena_texto' };
    await assert.rejects(create({ userId: 7, ...input }), AccountErasedError);
    await create({ userId: 8, ...input });
    await create({ userId: null, ...input });
    assert.deepEqual(translations.remaining(), [8, null]);
  });

  test('POST /translations responde 401 ACCOUNT_DELETED (el JWT ya no corresponde a una cuenta)', async () => {
    const translations = fakeTranslations([]);
    await makeEraseUserTranslations({ translationRepository: translations.repository })(7);
    const create = makeCreateTranslation({ translationRepository: translations.repository, eventPublisher: new InMemoryEventBus() });
    const controller = makeTranslationController({ create } as never);
    const app = express();
    app.use(express.json());
    app.post('/t', (req, res) => { req.user = { userId: 7 } as never; return controller.create(req, res); });
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    try {
      const response = await fetch('http://127.0.0.1:' + (server.address() as AddressInfo).port + '/t', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outputText: 'hola', type: 'sena_texto' }),
      });
      assert.equal(response.status, 401);
      assert.equal(((await response.json()) as { code: string }).code, 'ACCOUNT_DELETED');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  test('adaptador Postgres: eraseUser = lock + erased_users + DELETE en una transaccion', async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => { queries.push(sql.replace(/\s+/g, ' ').trim()); return { rowCount: 3, rows: [] }; },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as unknown as Pool;
    assert.equal(await makePostgresTranslationRepository(pool).eraseUser(7), 3);
    assert.equal(queries[0], 'BEGIN');
    assert.match(queries[1], /pg_advisory_xact_lock/);
    assert.match(queries[2], /^INSERT INTO public\.erased_users/);
    assert.match(queries[3], /^DELETE FROM public\.translations WHERE user_id = \$1$/);
    assert.equal(queries[4], 'COMMIT');
  });

  test('adaptador Postgres: create es un INSERT condicional bajo el mismo lock; sin fila = AccountErasedError', async () => {
    const queries: string[] = [];
    let rows: unknown[] = [];
    const client = {
      query: async (sql: string) => { queries.push(sql.replace(/\s+/g, ' ').trim()); return { rows }; },
      release: () => undefined,
    };
    const repository = makePostgresTranslationRepository({ connect: async () => client } as unknown as Pool);
    const input = { userId: 7, inputText: 'a', outputText: 'b', type: 'sena_texto' as const };
    await assert.rejects(repository.create(input), AccountErasedError);
    assert.match(queries[1], /pg_advisory_xact_lock/);
    assert.match(queries[2], /NOT EXISTS \(SELECT 1 FROM public\.erased_users/);
    assert.ok(queries.includes('COMMIT'));

    rows = [{ translation_id: 1, user_id: 7, input_text: 'a', output_text: 'b', type: 'sena_texto', confidence: null, source: null, is_deleted: false, created_at: new Date() }];
    assert.equal((await repository.create(input)).translationId, 1);
  });

  test('adaptador Mongo: unlinkRecorder pone recorded_by = null y NO borra', async () => {
    const calls: Array<{ filter: unknown; update: unknown }> = [];
    const collection = {
      updateMany: async (filter: unknown, update: unknown) => { calls.push({ filter, update }); return { modifiedCount: 2 }; },
      deleteMany: async () => { throw new Error('las muestras no se borran'); },
    };
    const repository = makeMongoSampleRepository(collection as unknown as import('mongodb').Collection<SampleDocument>);
    assert.equal(await repository.unlinkRecorder(7), 2);
    assert.deepEqual(calls, [{ filter: { recorded_by: 7 }, update: { $set: { recorded_by: null } } }]);
  });
});
