import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import {
  DEFAULT_RETENTION_DAYS, makePurgeExpiredTranslations,
} from '../src/translations/application/purge_expired_translations';
import { makePostgresTranslationRepository } from '../src/translations/adapters/outbound/postgres/translation_repository';
import { startRetentionScheduler } from '../src/translations/adapters/inbound/scheduler/retention_scheduler';
import { loadRecognitionConfig } from '../src/config';
import { TranslationRepository } from '../src/translations/ports/outbound/translation_repository';

const NOW = new Date('2026-10-24T15:00:00.000Z');

const repositoryWith = (purged: number) => {
  const purgeOlderThan = mock.fn(async (_cutoff: Date) => purged);
  return { repository: { purgeOlderThan } as unknown as TranslationRepository, purgeOlderThan };
};

describe('retencion de traducciones', () => {
  test('borra lo creado antes de hace 30 dias y devuelve cuantas', async () => {
    const { repository, purgeOlderThan } = repositoryWith(4);
    const purge = makePurgeExpiredTranslations({ translationRepository: repository, retentionDays: 30, now: () => NOW });

    assert.equal(await purge(), 4);
    assert.deepEqual(purgeOlderThan.mock.calls[0].arguments, [new Date('2026-09-24T15:00:00.000Z')]);
  });

  test('adaptador Postgres: borra y suma el resumen en una sola sentencia, sin contar las borradas por el usuario', async () => {
    const query = mock.fn(async (_sql: string, _params: unknown[]) => ({ rows: [{ purged: 5 }] }));
    const repository = makePostgresTranslationRepository({ query } as unknown as Pool);
    const cutoff = new Date('2026-09-24T15:00:00.000Z');

    assert.equal(await repository.purgeOlderThan(cutoff), 5);
    assert.equal(query.mock.callCount(), 1);
    const [sql, params] = query.mock.calls[0].arguments;
    assert.deepEqual(params, [cutoff]);
    assert.match(sql, /DELETE FROM public\.translations\s+WHERE created_at < \$1/);
    assert.match(sql, /INSERT INTO public\.translation_daily_counts/);
    assert.match(sql, /ON CONFLICT \(user_id, day\) DO UPDATE/);
    assert.match(sql, /INSERT INTO public\.translation_user_words/);
    assert.match(sql, /America\/Bogota/);
    assert.equal(sql.match(/is_deleted = FALSE/g)?.length, 2);
  });

  test('config: 30 dias por defecto, 0 lo apaga y un valor invalido no borra antes de tiempo', () => {
    const days = (value?: string) => loadRecognitionConfig(value === undefined ? {} : { TRANSLATION_RETENTION_DAYS: value })
      .translationRetentionDays;

    assert.equal(DEFAULT_RETENTION_DAYS, 30);
    assert.equal(days(), 30);
    assert.equal(days(''), 30);
    assert.equal(days('7'), 7);
    assert.equal(days('0'), 0);
    assert.equal(days('-3'), 30);
    assert.equal(days('1.5'), 30);
    assert.equal(days('abc'), 30);
    assert.equal(loadRecognitionConfig({ RECOGNITION_TRANSLATION_RETENTION_DAYS: '15' }).translationRetentionDays, 15);
  });

  test('scheduler: corre al arrancar, un error no tumba el proceso y stop espera la vuelta en curso', async () => {
    const logs: string[] = [];
    const errorLog = mock.method(console, 'error', () => undefined);
    let calls = 0;
    const run = async () => {
      calls += 1;
      if (calls === 1) throw new Error('base caida');
      return 2;
    };

    const failing = startRetentionScheduler({ run, tickMs: 60_000, log: message => logs.push(message) });
    await failing.stop();
    assert.equal(calls, 1);
    assert.equal(errorLog.mock.callCount(), 1);
    errorLog.mock.restore();

    const working = startRetentionScheduler({ run, tickMs: 60_000, log: message => logs.push(message) });
    await working.stop();
    assert.equal(calls, 2);
    assert.deepEqual(logs, ['[recognition] retencion: 2 traducciones vencidas borradas']);
  });
});
