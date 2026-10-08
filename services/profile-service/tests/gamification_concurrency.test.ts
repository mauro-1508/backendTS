import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { EventPublisher } from '@traduce/shared';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makePostgresUnitOfWork } from '../src/adapters/outbound/postgres/postgres_repositories';
import {
  TransactionalRepositories,
  UnitOfWork,
} from '../src/ports/repositories';

const connectionString = process.env.PROFILE_TEST_DATABASE_URL;
const required = process.env.GAMIFICATION_PG_TESTS === '1';
const TEST_DATABASE = 'profile_gamification_test';
const TEST_USER = 'gamification_test';
const WAIT_MS = 5000;

type PublishedEvent = {
  type: string;
  payload: unknown;
};

type Fixture = {
  admin: Pool;
  firstPool: Pool;
  secondPool: Pool;
  secondName: string;
  achievementId: string;
  published: PublishedEvent[];
  publisher: EventPublisher;
  tasks: Promise<unknown>[];
};

const deferred = () => {
  let resolvePromise!: () => void;
  const promise = new Promise<void>(resolveValue => {
    resolvePromise = resolveValue;
  });

  return { promise, resolve: resolvePromise };
};

async function within<T>(
  promise: Promise<T>,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), WAIT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Registra inmediatamente el rechazo para evitar unhandledRejection. */
function track<T>(fixture: Fixture, task: Promise<T>): Promise<T> {
  fixture.tasks.push(task);
  void task.catch(() => {});
  return task;
}

/** Usa la unidad de trabajo real y decora solo el caso de prueba. */
function decorate(
  pool: Pool,
  change: (
    repositories: TransactionalRepositories,
  ) => TransactionalRepositories,
): UnitOfWork {
  const original = makePostgresUnitOfWork(pool);

  return {
    run: work => original.run(repositories => work(change(repositories))),
  };
}

function checkedConnection(): string {
  assert.ok(
    connectionString,
    'Define PROFILE_TEST_DATABASE_URL para ejecutar PostgreSQL.',
  );

  const url = new URL(connectionString);

  assert.ok(
    url.protocol === 'postgresql:' || url.protocol === 'postgres:',
    'La conexion debe usar PostgreSQL.',
  );
  assert.equal(url.hostname, '127.0.0.1', 'Usa el contenedor de pruebas local.');
  assert.equal(url.port, '55437', 'El puerto exclusivo de pruebas es 55437.');
  assert.equal(decodeURIComponent(url.pathname.slice(1)), TEST_DATABASE);
  assert.equal(decodeURIComponent(url.username), TEST_USER);
  assert.equal(url.search, '', 'No se admiten opciones adicionales en la URL.');

  return connectionString;
}

async function withFixture(
  target: number,
  initialCount: number | undefined,
  work: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  const url = checkedConnection();
  const schema = `gamification_${randomUUID().replace(/-/g, '')}`;

  const common = {
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 12000,
    lock_timeout: 10000,
    idle_in_transaction_session_timeout: 15000,
  };

  const admin = new Pool({
    ...common,
    application_name: `${schema}_observer`,
  });

  const secondName = `${schema}_second`;
  const firstPool = new Pool({
    ...common,
    application_name: `${schema}_first`,
    options: `-c search_path=${schema}`,
  });
  const secondPool = new Pool({
    ...common,
    application_name: secondName,
    options: `-c search_path=${schema}`,
  });

  const published: PublishedEvent[] = [];
  const publisher: EventPublisher = {
    publish: async (type, payload) => {
      published.push({ type, payload });
    },
  };

  const fixture: Fixture = {
    admin,
    firstPool,
    secondPool,
    secondName,
    achievementId: randomUUID(),
    published,
    publisher,
    tasks: [],
  };

  let schemaCreated = false;

  try {
    const identity = await admin.query(
      'SELECT current_database() AS database, current_user AS username',
    );
    assert.equal(identity.rows[0].database, TEST_DATABASE);
    assert.equal(identity.rows[0].username, TEST_USER);

    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;

    const sql = await readFile(
      resolve(__dirname, '../db/001_profile.sql'),
      'utf8',
    );

    const client = await firstPool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release(true);
    }

    await firstPool.query('UPDATE achievements SET is_active = FALSE');
    await firstPool.query(
      `INSERT INTO achievements (
         achievement_id, code, name, description,
         metric, target_count, points
       )
       VALUES ($1, 'TEST_TRANSLATIONS', 'Test', 'Test',
               'TRANSLATIONS_COMPLETED', $2, 10)`,
      [fixture.achievementId, target],
    );

    if (initialCount !== undefined) {
      await firstPool.query(
        `INSERT INTO user_achievements (
           user_id, achievement_id, current_count
         ) VALUES ('user-a', $1, $2)`,
        [fixture.achievementId, initialCount],
      );
    }

    await work(fixture);
  } finally {
    await Promise.allSettled(fixture.tasks);

    try {
      await Promise.all([firstPool.end(), secondPool.end()]);
    } finally {
      try {
        if (schemaCreated) {
          await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        }
      } finally {
        await admin.end();
      }
    }
  }
}

async function waitForBlockedSecond(
  fixture: Fixture,
  lockType: 'advisory' | 'transactionid',
): Promise<void> {
  const deadline = Date.now() + WAIT_MS;

  while (Date.now() < deadline) {
    const result = await fixture.admin.query(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity a
         JOIN pg_locks l ON l.pid = a.pid
         WHERE a.datname = current_database()
           AND a.application_name = $1
           AND NOT l.granted
           AND l.locktype = $2
           AND cardinality(pg_blocking_pids(a.pid)) > 0
       ) AS blocked`,
      [fixture.secondName, lockType],
    );

    if (result.rows[0].blocked === true) return;

    await delay(20);
  }

  assert.fail(`La segunda transaccion no espero el bloqueo ${lockType}.`);
}

async function checkState(
  fixture: Fixture,
  userId: string,
  count: number,
  unlocked: boolean,
  events: number,
  notifications: number,
): Promise<void> {
  const result = await fixture.firstPool.query(
    `SELECT current_count, achieved_at, notified_at
     FROM user_achievements
     WHERE user_id = $1 AND achievement_id = $2`,
    [userId, fixture.achievementId],
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].current_count, count);
  assert.equal(result.rows[0].achieved_at !== null, unlocked);
  assert.equal(
    result.rows[0].notified_at !== null,
    notifications > 0,
  );

  const processed = await fixture.firstPool.query(
    'SELECT COUNT(*)::integer AS total FROM processed_events',
  );
  assert.equal(processed.rows[0].total, events);

  const notices = await fixture.firstPool.query(
    `SELECT COUNT(*)::integer AS total
     FROM notifications
     WHERE user_id = $1 AND reference_id = $2`,
    [userId, fixture.achievementId],
  );
  assert.equal(notices.rows[0].total, notifications);
}

async function concurrentCase(options: {
  target: number;
  initialCount?: number;
  duplicate?: boolean;
  expectedCount: number;
  unlocked: boolean;
}): Promise<void> {
  await withFixture(options.target, options.initialCount, async fixture => {
    const readReached = deferred();
    const releaseRead = deferred();

    const firstUow = decorate(fixture.firstPool, repositories => ({
      ...repositories,
      achievements: {
        ...repositories.achievements,
        findProgressByMetric: async (userId, metric) => {
          const progress =
            await repositories.achievements.findProgressByMetric(
              userId,
              metric,
            );

          readReached.resolve();
          await within(releaseRead.promise, 'No se libero la barrera.');
          return progress;
        },
      },
    }));

    const firstRecord = makeRecordTranslation({
      unitOfWork: firstUow,
      eventPublisher: fixture.publisher,
    });
    const secondRecord = makeRecordTranslation({
      unitOfWork: makePostgresUnitOfWork(fixture.secondPool),
      eventPublisher: fixture.publisher,
    });

    const firstEventId = randomUUID();
    const secondEventId = options.duplicate ? firstEventId : randomUUID();

    try {
      const first = track(
        fixture,
        firstRecord(firstEventId, 'user-a'),
      );

      await within(readReached.promise, 'La primera lectura no ocurrio.');

      const second = track(
        fixture,
        secondRecord(secondEventId, 'user-a'),
      );

      await waitForBlockedSecond(
        fixture,
        options.duplicate ? 'transactionid' : 'advisory',
      );

      releaseRead.resolve();

      const results = await Promise.all([first, second]);
      assert.equal(
        results.flat().length,
        options.unlocked ? 1 : 0,
      );

      await checkState(
        fixture,
        'user-a',
        options.expectedCount,
        options.unlocked,
        options.duplicate ? 1 : 2,
        options.unlocked ? 1 : 0,
      );

      assert.deepEqual(
        fixture.published,
        options.unlocked
          ? [{
              type: 'profile.AchievementUnlocked',
              payload: {
                userId: 'user-a',
                achievementId: fixture.achievementId,
                code: 'TEST_TRANSLATIONS',
                points: 10,
              },
            }]
          : [],
      );
    } finally {
      releaseRead.resolve();
      await Promise.allSettled(fixture.tasks);
    }
  });
}

describe(
  'Gamification: concurrencia PostgreSQL',
  {
    skip: !connectionString && !required
      ? 'Define PROFILE_TEST_DATABASE_URL para ejecutar integracion.'
      : false,
    concurrency: false,
  },
  () => {
    for (const state of ['absent', 'inactive'] as const) {
      it(`no registra notified_at con tipo ${state}`, async () => {
        await withFixture(1, undefined, async fixture => {
          if (state === 'absent') {
            await fixture.firstPool.query(
              `DELETE FROM notification_types
               WHERE code = 'ACHIEVEMENT_UNLOCKED'`,
            );
          } else {
            await fixture.firstPool.query(
              `UPDATE notification_types
               SET is_active = FALSE
               WHERE code = 'ACHIEVEMENT_UNLOCKED'`,
            );
          }

          const record = makeRecordTranslation({
            unitOfWork: makePostgresUnitOfWork(fixture.firstPool),
            eventPublisher: fixture.publisher,
          });

          const unlocked = await track(
            fixture,
            record(randomUUID(), 'user-a'),
          );

          assert.equal(unlocked.length, 1);
          await checkState(fixture, 'user-a', 1, true, 1, 0);
          assert.equal(fixture.published.length, 1);
        });
      });
    }

    it('conserva ambos incrementos cuando no existe progreso', async () => {
      await concurrentCase({
        target: 3,
        expectedCount: 2,
        unlocked: false,
      });
    });

    it('desbloquea una sola vez con progreso existente', async () => {
      await concurrentCase({
        target: 3,
        initialCount: 1,
        expectedCount: 3,
        unlocked: true,
      });
    });

    it('desbloquea una sola vez desde una fila inexistente', async () => {
      await concurrentCase({
        target: 1,
        expectedCount: 1,
        unlocked: true,
      });
    });

    it('un eventId concurrente cuenta una sola vez', async () => {
      await concurrentCase({
        target: 3,
        duplicate: true,
        expectedCount: 1,
        unlocked: false,
      });
    });

    it('rollback libera el bloqueo y permite reintentar el evento', async () => {
      await withFixture(1, undefined, async fixture => {
        const eventId = randomUUID();

        const failingUow = decorate(fixture.firstPool, repositories => ({
          ...repositories,
          achievements: {
            ...repositories.achievements,
            markNotified: async (userId, achievementId) => {
              await repositories.achievements.markNotified(
                userId,
                achievementId,
              );
              throw new Error('forced rollback');
            },
          },
        }));

        const failingRecord = makeRecordTranslation({
          unitOfWork: failingUow,
          eventPublisher: fixture.publisher,
        });

        await assert.rejects(
          track(fixture, failingRecord(eventId, 'user-a')),
          /forced rollback/,
        );

        for (const table of [
          'user_achievements',
          'notifications',
          'processed_events',
        ]) {
          const result = await fixture.firstPool.query(
            `SELECT COUNT(*)::integer AS total FROM ${table}`,
          );
          assert.equal(result.rows[0].total, 0);
        }
        assert.deepEqual(fixture.published, []);

        const retry = makeRecordTranslation({
          unitOfWork: makePostgresUnitOfWork(fixture.secondPool),
          eventPublisher: fixture.publisher,
        });

        const unlocked = await within(
          track(fixture, retry(eventId, 'user-a')),
          'El rollback no libero el bloqueo.',
        );
        assert.equal(unlocked.length, 1);

        await checkState(fixture, 'user-a', 1, true, 1, 1);
        assert.equal(fixture.published.length, 1);
      });
    });

    it('otro usuario puede avanzar mientras el primero esta pausado', async () => {
      await withFixture(3, undefined, async fixture => {
        const hashes = await fixture.firstPool.query(
          `SELECT hashtext('user-a') <> hashtext('user-b') AS distinct_keys`,
        );
        assert.equal(hashes.rows[0].distinct_keys, true);

        const readReached = deferred();
        const releaseRead = deferred();

        const pausedUow = decorate(fixture.firstPool, repositories => ({
          ...repositories,
          achievements: {
            ...repositories.achievements,
            findProgressByMetric: async (userId, metric) => {
              const progress =
                await repositories.achievements.findProgressByMetric(
                  userId,
                  metric,
                );

              readReached.resolve();
              await within(releaseRead.promise, 'No se libero la barrera.');
              return progress;
            },
          },
        }));

        const firstRecord = makeRecordTranslation({
          unitOfWork: pausedUow,
          eventPublisher: fixture.publisher,
        });
        const secondRecord = makeRecordTranslation({
          unitOfWork: makePostgresUnitOfWork(fixture.secondPool),
          eventPublisher: fixture.publisher,
        });

        try {
          const first = track(
            fixture,
            firstRecord(randomUUID(), 'user-a'),
          );
          await within(readReached.promise, 'La primera lectura no ocurrio.');

          await within(
            track(fixture, secondRecord(randomUUID(), 'user-b')),
            'El segundo usuario quedo bloqueado.',
          );

          releaseRead.resolve();
          await first;

          await checkState(fixture, 'user-a', 1, false, 2, 0);
          await checkState(fixture, 'user-b', 1, false, 2, 0);
          assert.deepEqual(fixture.published, []);
        } finally {
          releaseRead.resolve();
          await Promise.allSettled(fixture.tasks);
        }
      });
    });
  },
);
