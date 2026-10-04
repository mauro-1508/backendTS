import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventPublisher, InMemoryEventBus, EventEnvelope } from '@traduce/shared';
import { makeCreateTranslation, TRANSLATION_PRODUCED_EVENT } from '../src/translations/application/create_translation';
import { Translation } from '../src/translations/domain/entity';
import { TranslationRepository } from '../src/translations/domain/repository';

const CREATED_AT = new Date('2026-01-02T03:04:05.000Z');

class FakeTranslationRepository implements TranslationRepository {
  async create(input: Parameters<TranslationRepository['create']>[0]): Promise<Translation> {
    return { translationId: 7, isDeleted: false, createdAt: CREATED_AT, confidence: null, source: null, ...input } as Translation;
  }
  async listByUser() { return []; }
  async softDelete() { return null; }
}

const validInput = { userId: 5, inputText: 'HOLA', outputText: ' Hola ', type: 'sena_texto' };

describe('create_translation', () => {
  test('publica recognition.TranslationProduced con la forma del contrato', async () => {
    const bus = new InMemoryEventBus();
    const received: EventEnvelope[] = [];
    await bus.subscribe({ queue: 'test', pattern: 'recognition.*' }, async event => { received.push(event); });

    const result = await makeCreateTranslation({
      translationRepository: new FakeTranslationRepository(),
      eventPublisher: bus,
    })(validInput);

    assert.equal(result.success, true);
    assert.equal(received.length, 1);
    assert.equal(received[0].type, TRANSLATION_PRODUCED_EVENT);
    assert.deepEqual(received[0].payload, {
      translationId: 7,
      userId: 5,
      gloss: 'HOLA',
      text: 'Hola',
      occurredAt: CREATED_AT.toISOString(),
    });
  });

  test('no publica nada si la traduccion es invalida', async () => {
    const published: string[] = [];
    const publisher: EventPublisher = { publish: async type => { published.push(type); } };
    const create = makeCreateTranslation({ translationRepository: new FakeTranslationRepository(), eventPublisher: publisher });

    await assert.rejects(create({ ...validInput, type: 'otro' }), /type invalido/);
    assert.deepEqual(published, []);
  });

  test('si el bus falla, la traduccion se guarda igual', async () => {
    const failingPublisher: EventPublisher = { publish: async () => { throw new Error('broker caido'); } };
    const originalError = console.error;
    console.error = () => undefined;
    try {
      const result = await makeCreateTranslation({
        translationRepository: new FakeTranslationRepository(),
        eventPublisher: failingPublisher,
      })(validInput);
      assert.equal(result.success, true);
    } finally {
      console.error = originalError;
    }
  });
});
