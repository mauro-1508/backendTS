import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeRecordEvent } from '../src/application/record_event';
import { makeGetDailySeries, makeGetSummary, makeGetTopSigns } from '../src/application/reports';
import { AnalyticsValidationError } from '../src/domain/rules';
import { UsageEvent } from '../src/domain/entity';
import { makeInMemoryUsageRepository } from './helpers/fakes';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

const completed = (eventId: string, createdAt: string, signCodes: string[]): UsageEvent => ({
  eventId, userId: '1', sessionId: null, section: 'TRANSLATION', eventType: 'TRANSLATION_COMPLETED',
  referenceType: null, referenceId: null, signCodes, createdAt: new Date(createdAt),
});
const registered = (eventId: string, createdAt: string): UsageEvent => ({
  eventId, userId: '2', sessionId: null, section: 'HOME', eventType: 'USER_REGISTERED',
  referenceType: 'USER', referenceId: '2', signCodes: [], createdAt: new Date(createdAt),
});

describe('recordEvent', () => {
  let repository: ReturnType<typeof makeInMemoryUsageRepository>;
  let recordEvent: ReturnType<typeof makeRecordEvent>;
  beforeEach(() => {
    repository = makeInMemoryUsageRepository();
    recordEvent = makeRecordEvent({ repository, newId: () => 'evt-1', now: () => new Date('2026-10-01T15:00:00Z') });
  });

  test('guarda SECTION_VIEW con el userId del token', async () => {
    await recordEvent({ userId: 7, section: 'ALPHABET', eventType: 'SECTION_VIEW', sessionId: SESSION_ID });
    assert.deepEqual(repository.events[0], {
      eventId: 'evt-1', userId: '7', sessionId: SESSION_ID, section: 'ALPHABET', eventType: 'SECTION_VIEW',
      referenceType: null, referenceId: null, signCodes: [], createdAt: new Date('2026-10-01T15:00:00Z'),
    });
  });

  test('rechaza section o eventType desconocidos', async () => {
    await assert.rejects(recordEvent({ userId: 1, section: 'NOPE', eventType: 'SECTION_VIEW' }), AnalyticsValidationError);
    await assert.rejects(recordEvent({ userId: 1, section: 'HOME', eventType: 'XX' }), AnalyticsValidationError);
  });

  test('el cliente no puede registrar USER_REGISTERED', async () => {
    await assert.rejects(recordEvent({ userId: 1, section: 'HOME', eventType: 'USER_REGISTERED' }), AnalyticsValidationError);
  });

  test('rechaza sessionId que no es UUID y referencia incompleta', async () => {
    await assert.rejects(
      recordEvent({ userId: 1, section: 'HOME', eventType: 'SECTION_VIEW', sessionId: 'abc' }), AnalyticsValidationError);
    await assert.rejects(
      recordEvent({ userId: 1, section: 'HOME', eventType: 'SECTION_VIEW', referenceType: 'SIGN' }), AnalyticsValidationError);
    assert.equal(repository.events.length, 0);
  });
});

describe('reportes', () => {
  let repository: ReturnType<typeof makeInMemoryUsageRepository>;
  beforeEach(async () => {
    repository = makeInMemoryUsageRepository();
    await repository.save(completed('a', '2026-10-01T15:00:00Z', ['HOLA', 'GRACIAS']));
    await repository.save(completed('b', '2026-10-01T16:00:00Z', ['HOLA']));
    await repository.save(completed('c', '2026-10-02T15:00:00Z', ['HOLA']));
    await repository.save(registered('d', '2026-10-02T16:00:00Z'));
    // 01:00 UTC del 3 sigue siendo el 2 en Colombia (UTC-5).
    await repository.save(registered('e', '2026-10-03T01:00:00Z'));
    await repository.save(completed('f', '2026-10-09T15:00:00Z', ['FUERA']));
  });

  test('resumen cuenta traducciones y usuarios nuevos del rango', async () => {
    const summary = await makeGetSummary({ repository })({ from: '2026-10-01', to: '2026-10-02' });
    assert.deepEqual(summary, { translations: 3, newUsers: 2 });
  });

  test('top de señas ordena por traducciones y respeta limit', async () => {
    const top = await makeGetTopSigns({ repository })({ from: '2026-10-01', to: '2026-10-02', limit: '1' });
    assert.deepEqual(top, [{ signCode: 'HOLA', translations: 3 }]);
  });

  test('serie diaria agrupa por dia', async () => {
    const series = await makeGetDailySeries({ repository })({ from: '2026-10-01', to: '2026-10-02' });
    assert.deepEqual(series, [
      { date: '2026-10-01', translations: 2, newUsers: 0 },
      { date: '2026-10-02', translations: 1, newUsers: 2 },
    ]);
  });

  test('valida el rango y el limit', async () => {
    const summary = makeGetSummary({ repository });
    await assert.rejects(summary({ from: undefined, to: '2026-10-02' }), AnalyticsValidationError);
    await assert.rejects(summary({ from: '2026-13-01', to: '2026-13-02' }), AnalyticsValidationError);
    await assert.rejects(summary({ from: '2026-10-05', to: '2026-10-01' }), AnalyticsValidationError);
    await assert.rejects(
      makeGetTopSigns({ repository })({ from: '2026-10-01', to: '2026-10-02', limit: '0' }), AnalyticsValidationError);
  });
});
