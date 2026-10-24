import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { makeRecordTranslation } from '../src/application/record_translation';
import { makeEraseUserProfile } from '../src/application/erase_user_profile';
import { makeUpdatePreferences } from '../src/application/preferences';
import { ProfileError } from '../src/domain/errors';
import {
  makePostgresProfileRepository,
  makePostgresRepositories,
  makePostgresUnitOfWork,
} from '../src/adapters/outbound/postgres/postgres_repositories';
import { makeRegisterUserProfile } from '../src/application/register_user_profile';
import {
  makeRecoverUserProfile,
} from '../src/application/recover_user_profile';
import {
  DEFAULT_PREFERENCES,
  PreferencesPatch,
} from '../src/domain/preferences';
import { UnitOfWork } from '../src/ports/repositories';

// La integración solo admite la instancia exclusiva de pruebas.
// No carga archivos .env.
const connectionString = process.env.PROFILE_TEST_DATABASE_URL;
const required = process.env.PROFILE_PREFERENCES_PG_TESTS === '1';
const TEST_DATABASE = 'profile_gamification_test';
const TEST_USER = 'gamification_test';

type Fixture = {
  first: Pool;
  second: Pool;
  observer: Pool;
  secondName: string;
};

// Cada prueba aplica la migración en un esquema temporal independiente.
// Las conexiones de trabajo excluyen public de su search_path.
async function withFixture(
  work: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  assert.ok(connectionString, 'Define PROFILE_TEST_DATABASE_URL');
  const url = new URL(connectionString);

  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55437');
  assert.equal(decodeURIComponent(url.pathname.slice(1)), TEST_DATABASE);
  assert.equal(decodeURIComponent(url.username), TEST_USER);
  assert.equal(url.search, '');
  assert.equal(url.hash, '');

  const schema = `preferences_${randomUUID().replace(/-/g, '')}`;
  assert.match(schema, /^preferences_[a-f0-9]{32}$/);

  const secondName = `${schema}_second`;
  const common = {
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    lock_timeout: 8000,
    idle_in_transaction_session_timeout: 10000,
  };

  const observer = new Pool(common);
  const first = new Pool({
    ...common,
    options: `-c search_path=${schema}`,
  });
  const second = new Pool({
    ...common,
    options: `-c search_path=${schema}`,
    application_name: secondName,
  });

  let created = false;

  try {
    const identity = await observer.query(
      'SELECT current_database() AS database, current_user AS username',
    );
    assert.equal(identity.rows[0].database, TEST_DATABASE);
    assert.equal(identity.rows[0].username, TEST_USER);

    await observer.query(`CREATE SCHEMA "${schema}"`);
    created = true;

    const sql = await readFile(
      resolve(__dirname, '../db/001_profile.sql'),
      'utf8',
    );

    const client = await first.connect();
    try {
      const active = await client.query(
        'SELECT current_schema() AS schema',
      );
      assert.equal(active.rows[0].schema, schema);
      await client.query(sql);
      await client.query(await readFile(resolve(__dirname, '../db/004_achievement_catalog.sql'), 'utf8'));
      await client.query(await readFile(resolve(__dirname, '../db/005_obtainable_achievements.sql'), 'utf8'));
      // El borrado de cuenta tambien limpia los recibos y la actividad de logros (006 y 007).
      await client.query(await readFile(resolve(__dirname, '../db/006_translation_milestones.sql'), 'utf8'));
      await client.query(await readFile(resolve(__dirname, '../db/007_functional_achievements.sql'), 'utf8'));
      // La proyección también necesita la marca de cuentas eliminadas.
      await client.query(await readFile(
        resolve(__dirname, '../db/002_erased_users.sql'),
        'utf8',
      ));
    } finally {
      // Destruye la conexión por si la migración falló con una transacción abierta.
      client.release(true);
    }

    for (const pool of [first, second]) {
      const active = await pool.query(
        'SELECT current_schema() AS schema',
      );
      assert.equal(active.rows[0].schema, schema);
    }

    await work({ first, second, observer, secondName });
  } finally {
    try {
      await Promise.allSettled([first.end(), second.end()]);
    } finally {
      try {
        if (created) {
          await observer.query(`DROP SCHEMA "${schema}" CASCADE`);
        }
      } finally {
        await observer.end();
      }
    }
  }
}

async function seedProfile(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO user_profiles (user_id, full_name, email)
     VALUES ('7', 'Nombre existente', 'existing@example.test')`,
  );
}

// Comprueba preferencias, conservación de identidad y ausencia de efectos
// sobre logros y notificaciones.
async function check(
  pool: Pool,
  expected: {
    ui_language: string;
    theme: string;
    notifications_enabled: boolean;
  },
): Promise<void> {
  const preferences = await pool.query(
    `SELECT ui_language, theme, notifications_enabled
       FROM user_preferences WHERE user_id = '7'`,
  );
  assert.deepEqual(preferences.rows, [expected]);

  const profile = await pool.query(
    `SELECT full_name, email FROM user_profiles WHERE user_id = '7'`,
  );
  assert.deepEqual(profile.rows, [{
    full_name: 'Nombre existente',
    email: 'existing@example.test',
  }]);

  for (const table of ['user_achievements', 'notifications']) {
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM ${table}`,
    );
    assert.equal(count.rows[0].total, 0);
  }
}

// Observa un bloqueo real. Solo se utiliza en escenarios que deben
// disputar una escritura o una inserción todavía no confirmada.
async function waitForBlocked(fixture: Fixture): Promise<void> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const result = await fixture.observer.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
          WHERE application_name = $1
            AND datname = current_database()
            AND cardinality(pg_blocking_pids(pid)) > 0
       ) AS blocked`,
      [fixture.secondName],
    );

    if (result.rows[0].blocked) return;
    await delay(20);
  }

  assert.fail('La segunda operación no quedó bloqueada');
}

// Mantiene abierta la primera transacción para coordinar dos operaciones.
// No introduce bloqueos artificiales en el código de producción.
async function concurrentCase(
  fixture: Fixture,
  firstKind: 'patch' | 'registration',
  secondKind: 'patch' | 'registration',
  existing: boolean,
): Promise<void> {
  const client = await fixture.first.connect();
  let transactionOpen = false;
  let discardClient = false;
  let pending: Promise<unknown> | undefined;

  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    transactionOpen = true;

    if (firstKind === 'patch') {
      await makePostgresProfileRepository(client).updatePreferences('7', {
        theme: 'DARK',
      });
    } else {
      const unitOfWork: UnitOfWork = {
        run: work => work(makePostgresRepositories(client)),
      };

      await makeRegisterUserProfile({ unitOfWork })(randomUUID(), {
        userId: '7',
        fullName: 'Nombre del evento que no debe sobrescribir',
      });
    }

    pending = secondKind === 'patch'
      ? makePostgresProfileRepository(fixture.second).updatePreferences('7', {
          uiLanguage: 'EN',
          notificationsEnabled: false,
        })
      : makeRegisterUserProfile({
          unitOfWork: makePostgresUnitOfWork(fixture.second),
        })(randomUUID(), {
          userId: '7',
          fullName: 'Otro nombre que no debe sobrescribir',
        });

    void pending.catch(() => {});

    if (existing && firstKind === 'registration') {
      // El registro no modifica las preferencias existentes.
      // El PATCH puede finalizar antes de confirmar el registro.
      await pending;
    } else {
      // El primer PATCH o la inserción de preferencias mantiene
      // un conflicto pendiente. Comprueba la espera y luego permite
      // que el COMMIT situado debajo libere la segunda operación.
      await waitForBlocked(fixture);
    }

    await client.query('COMMIT');
    transactionOpen = false;
    await pending;
  } finally {
    try {
      if (transactionOpen) await client.query('ROLLBACK');
    } catch (error) {
      discardClient = true;
      throw error;
    } finally {
      // Libera o destruye el cliente antes de esperar operaciones pendientes.
      client.release(discardClient);
      await pending?.catch(() => {});
    }
  }
}

// La recuperación admite las tres formas de nombre sin inventar valores.
const recoveryIdentities = [
  {
    userId: 7,
    email: 'ada@example.com',
    name: 'Ada Lovelace',
  },
  {
    userId: 7,
    email: 'ada@example.com',
  },
  {
    userId: 7,
    email: 'ada@example.com',
    name: null,
  },
];

// Captura filas completas para comprobar que la recuperación conserva
// datos, identificadores y fechas existentes.
// Cada tabla utiliza sus propias columnas de ordenación.
async function snapshotRecoveryState(pool: Pool) {
  const queries = [
    'SELECT * FROM user_profiles ORDER BY user_id',
    'SELECT * FROM user_preferences ORDER BY user_id',
    'SELECT * FROM processed_events ORDER BY event_id',
    'SELECT * FROM user_achievements ORDER BY user_id, achievement_id',
    'SELECT * FROM notifications ORDER BY notification_id',
  ];

  return Promise.all(
    queries.map(async sql => (await pool.query(sql)).rows),
  );
}

describe('preferencias: PostgreSQL real', {
  concurrency: false,
  skip: !connectionString && !required
    ? 'Define PROFILE_TEST_DATABASE_URL para ejecutar integración'
    : false,
}, () => {
  it('ejecuta las siete combinaciones al insertar y actualizar', async () => {
    await withFixture(async fixture => {
      await seedProfile(fixture.first);
      const repository = makePostgresProfileRepository(fixture.first);
      const candidates: PreferencesPatch[] = [
        { uiLanguage: 'EN' },
        { theme: 'DARK' },
        { notificationsEnabled: false },
      ];

      for (let mask = 1; mask < 8; mask++) {
        const patch: PreferencesPatch = {};

        for (let index = 0; index < candidates.length; index++) {
          if (mask & (1 << index)) {
            Object.assign(patch, candidates[index]);
          }
        }

        const expected = { ...DEFAULT_PREFERENCES, ...patch };

        await fixture.first.query(
          `DELETE FROM user_preferences WHERE user_id = '7'`,
        );

        for (const attempt of ['insert', 'update']) {
          const result = await repository.updatePreferences('7', patch);

          assert.ok(result, `${mask}: ${attempt}`);
          assert.equal(result.uiLanguage, expected.uiLanguage);
          assert.equal(result.theme, expected.theme);
          assert.equal(
            result.notificationsEnabled,
            expected.notificationsEnabled,
          );
          assert.ok(result.updatedAt);
        }
      }

      await check(fixture.first, {
        ui_language: 'EN',
        theme: 'DARK',
        notifications_enabled: false,
      });
    });
  });

  it('conserva campos omitidos, false y el identificador existente', async () => {
    await withFixture(async fixture => {
      await seedProfile(fixture.first);
      await fixture.first.query(
        `INSERT INTO user_preferences
           (user_id, ui_language, notifications_enabled)
         VALUES ('7', 'EN', FALSE)`,
      );

      const before = await fixture.first.query(
        `SELECT user_preference_id FROM user_preferences WHERE user_id = '7'`,
      );

      await makePostgresProfileRepository(fixture.first).updatePreferences(
        '7',
        { theme: 'DARK' },
      );

      const after = await fixture.first.query(
        `SELECT user_preference_id FROM user_preferences WHERE user_id = '7'`,
      );

      assert.deepEqual(after.rows, before.rows);
      await check(fixture.first, {
        ui_language: 'EN',
        theme: 'DARK',
        notifications_enabled: false,
      });
    });
  });

  it('la reparación repetida no duplica preferencias', async () => {
    await withFixture(async fixture => {
      await seedProfile(fixture.first);
      const repository = makePostgresProfileRepository(fixture.first);

      await repository.updatePreferences('7', {
        notificationsEnabled: false,
      });

      const before = await fixture.first.query(
        `SELECT user_preference_id FROM user_preferences WHERE user_id = '7'`,
      );

      await repository.updatePreferences('7', {
        notificationsEnabled: false,
      });

      const after = await fixture.first.query(
        `SELECT user_preference_id FROM user_preferences WHERE user_id = '7'`,
      );

      assert.equal(after.rows.length, 1);
      assert.deepEqual(after.rows, before.rows);
      await check(fixture.first, {
        ui_language: 'ES',
        theme: 'LIGHT',
        notifications_enabled: false,
      });
    });
  });

  it('sin perfil devuelve null y no modifica preferencias huérfanas', async () => {
    await withFixture(async fixture => {
      const repository = makePostgresProfileRepository(fixture.first);

      assert.equal(
        await repository.updatePreferences('7', { theme: 'DARK' }),
        null,
      );

      const absent = await fixture.first.query(
        'SELECT COUNT(*)::int AS total FROM user_preferences',
      );
      assert.equal(absent.rows[0].total, 0);

      await fixture.first.query(
        `INSERT INTO user_preferences (user_id) VALUES ('7')`,
      );

      assert.equal(
        await repository.updatePreferences('7', { theme: 'DARK' }),
        null,
      );

      const orphan = await fixture.first.query(
        `SELECT theme FROM user_preferences WHERE user_id = '7'`,
      );
      assert.equal(orphan.rows[0].theme, 'LIGHT');
    });
  });

  for (const existing of [false, true]) {
    it(`dos PATCH conservan campos distintos; fila existente=${existing}`, async () => {
      await withFixture(async fixture => {
        await seedProfile(fixture.first);

        if (existing) {
          await fixture.first.query(
            `INSERT INTO user_preferences (user_id) VALUES ('7')`,
          );
        }

        await concurrentCase(fixture, 'patch', 'patch', existing);
        await check(fixture.first, {
          ui_language: 'EN',
          theme: 'DARK',
          notifications_enabled: false,
        });
      });
    });
  }

  for (const existing of [false, true]) {
    for (const firstKind of ['patch', 'registration'] as const) {
      it(`PATCH/consumidor: primero ${firstKind}, fila existente=${existing}`, async () => {
        await withFixture(async fixture => {
          await seedProfile(fixture.first);

          if (existing) {
            await fixture.first.query(
              `INSERT INTO user_preferences (user_id) VALUES ('7')`,
            );
          }

          await concurrentCase(
            fixture,
            firstKind,
            firstKind === 'patch' ? 'registration' : 'patch',
            existing,
          );

          await check(fixture.first, firstKind === 'patch'
            ? {
                ui_language: 'ES',
                theme: 'DARK',
                notifications_enabled: true,
              }
            : {
                ui_language: 'EN',
                theme: 'LIGHT',
                notifications_enabled: false,
              });

          const events = await fixture.first.query(
            'SELECT COUNT(*)::int AS total FROM processed_events',
          );
          assert.equal(events.rows[0].total, 1);
        });
      });
    }
  }

  it('rollback revierte la reparación y permite reintentar', async () => {
    await withFixture(async fixture => {
      await seedProfile(fixture.first);

      await assert.rejects(
        makePostgresUnitOfWork(fixture.first).run(async repositories => {
          await repositories.profiles.updatePreferences('7', {
            notificationsEnabled: false,
          });
          throw new Error('forced rollback');
        }),
        /forced rollback/,
      );

      const result = await fixture.first.query(
        'SELECT COUNT(*)::int AS total FROM user_preferences',
      );
      assert.equal(result.rows[0].total, 0);

      await makePostgresProfileRepository(fixture.first).updatePreferences(
        '7',
        { theme: 'DARK' },
      );

      await check(fixture.first, {
        ui_language: 'ES',
        theme: 'DARK',
        notifications_enabled: true,
      });
    });
  });

  // Recorre doce escenarios: tres formas de nombre y cuatro estados
  // de existencia de perfil/preferencias.
  // Las dos conexiones ejecutan recuperaciones sobre el mismo usuario.
  it('recupera cada estado parcial con nombre presente, ausente o null',
    async () => {
      for (const identity of recoveryIdentities) {
        for (const existing of ['none', 'profile', 'preferences', 'both']) {
          await withFixture(async ({ first, second }) => {
            await first.query(
              'INSERT INTO processed_events (event_id) VALUES ($1)',
              [randomUUID()],
            );

            if (existing === 'profile' || existing === 'both') {
              await first.query(`
                INSERT INTO user_profiles
                  (user_id, email, full_name, username, created_at)
                VALUES (
                  '7', NULL, 'Nombre conservado', 'alias',
                  '2020-01-01T00:00:00Z'
                )
              `);
            }

            if (existing === 'preferences' || existing === 'both') {
              await first.query(`
                INSERT INTO user_preferences
                  (user_id, ui_language, theme,
                   notifications_enabled, updated_at)
                VALUES (
                  '7', 'EN', 'DARK', FALSE,
                  '2020-01-01T00:00:00Z'
                )
              `);
            }

            const before = await snapshotRecoveryState(first);

            const recover = makeRecoverUserProfile({
              unitOfWork: makePostgresUnitOfWork(first),
            });
            const recoverAgain = makeRecoverUserProfile({
              unitOfWork: makePostgresUnitOfWork(second),
            });

            await Promise.all([
              recover(identity),
              recoverAgain(identity),
            ]);

            const after = await snapshotRecoveryState(first);

            assert.equal(after[0].length, 1);
            assert.equal(after[1].length, 1);

            if (before[0].length) {
              assert.deepEqual(after[0], before[0]);
            } else {
              assert.equal(after[0][0].user_id, '7');
              assert.equal(after[0][0].email, identity.email);
              assert.equal(
                after[0][0].full_name,
                identity.name ?? null,
              );
              assert.equal(after[0][0].username, null);
            }

            if (before[1].length) {
              assert.deepEqual(after[1], before[1]);
            } else {
              assert.equal(after[1][0].ui_language, 'ES');
              assert.equal(after[1][0].theme, 'LIGHT');
              assert.equal(after[1][0].notifications_enabled, true);
            }

            // La recuperación no procesa eventos ni crea actividad.
            assert.deepEqual(after.slice(2), before.slice(2));

            // Cambiar la entrada no debe sobrescribir filas existentes,
            // incluidos sus identificadores, fechas y campos nulos.
            await recover({
              userId: 7,
              email: 'different@example.com',
              name: 'Otro nombre',
            });
            await recover({
              userId: 7,
              email: identity.email,
            });
            await recover({
              userId: 7,
              email: identity.email,
              name: null,
            });

            assert.deepEqual(
              await snapshotRecoveryState(first),
              after,
            );
          });
        }
      }
    },
  );

  // Fuerza un fallo en preferencias para comprobar que la transacción
  // tampoco deja creado el perfil. Después retira el fallo y reintenta.
  it('revierte la creación del perfil si fallan las preferencias',
    async () => {
      for (const identity of recoveryIdentities) {
        await withFixture(async ({ first }) => {
          await first.query(`
            ALTER TABLE user_preferences
            ADD CONSTRAINT reject_recovery_user
            CHECK (user_id <> '7')
          `);

          const before = await snapshotRecoveryState(first);
          const recover = makeRecoverUserProfile({
            unitOfWork: makePostgresUnitOfWork(first),
          });

          await assert.rejects(
            recover(identity),
            (error: unknown) =>
              (error as { code?: string }).code === '23514',
          );

          assert.deepEqual(
            await snapshotRecoveryState(first),
            before,
          );

          await first.query(`
            ALTER TABLE user_preferences
            DROP CONSTRAINT reject_recovery_user
          `);

          await recover(identity);

          const after = await snapshotRecoveryState(first);
          assert.equal(after[0].length, 1);
          assert.equal(after[1].length, 1);
          assert.equal(after[0][0].full_name, identity.name ?? null);
          assert.deepEqual(after.slice(2), before.slice(2));
        });
      }
    },
  );
});
describe('eliminación concurrente: PostgreSQL real', {
  concurrency: false,
  skip: !connectionString && !required
    ? 'Define PROFILE_TEST_DATABASE_URL para ejecutar integración'
    : false,
}, () => {
  for (const operation of ['registration', 'recovery', 'preferences', 'translation'] as const) {
    for (const deletionFirst of [true, false]) {
      it(`${operation}: borrado primero=${deletionFirst}`, async () => {
        await withFixture(async fixture => {
          // Existe perfil, pero faltan preferencias: también probamos
          // que su reparación no pueda sobrevivir al borrado.
          await seedProfile(fixture.first);

          // Otra cuenta debe permanecer intacta.
          await makeRecoverUserProfile({
            unitOfWork: makePostgresUnitOfWork(fixture.first),
          })({
            userId: 8,
            email: 'other@example.test',
            name: 'Otra cuenta',
          });

          const otherBefore = await fixture.first.query(
            `SELECT row_to_json(p) AS profile, row_to_json(pr) AS preferences
               FROM user_profiles p
               JOIN user_preferences pr USING (user_id)
              WHERE p.user_id = '8'`,
          );

          const runOperation = async (unitOfWork: UnitOfWork) => {
            if (operation === 'registration') {
              await makeRegisterUserProfile({ unitOfWork })(
                randomUUID(),
                { userId: '7', fullName: 'Registro pendiente' },
              );
            } else if (operation === 'recovery') {
              await makeRecoverUserProfile({ unitOfWork })({
                userId: 7,
                email: 'recovery@example.test',
                name: 'Recuperación pendiente',
              });
            } else if (operation === 'translation') {
              const unlocked = await makeRecordTranslation({
                unitOfWork,
                eventPublisher: { publish: async () => {} },
              })(randomUUID(), '7');
              assert.equal(unlocked.length, deletionFirst ? 0 : 1);
            } else {
              await makeUpdatePreferences({
                unitOfWork,
                // Esta prueba no envía mensajes a otros servicios.
                eventPublisher: { publish: async () => {} },
              })('7', { theme: 'DARK' });
            }
          };

          const runDeletion = async (unitOfWork: UnitOfWork) => {
            await makeEraseUserProfile({ unitOfWork })(
              randomUUID(),
              '7',
            );
          };

          const client = await fixture.first.connect();
          let transactionOpen = false;
          let discardClient = false;

          type Outcome =
            | { ok: true }
            | { ok: false; error: unknown };

          let pending: Promise<Outcome> | undefined;

          try {
            await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            transactionOpen = true;

            // Mantiene abierta la primera transacción después de ejecutar
            // el caso de uso. Los bloqueos son los del código de producción.
            const firstUnitOfWork: UnitOfWork = {
              run: work => work(makePostgresRepositories(client)),
            };
            const secondUnitOfWork = makePostgresUnitOfWork(fixture.second);

            if (deletionFirst) {
              await runDeletion(firstUnitOfWork);
            } else {
              await runOperation(firstUnitOfWork);
            }

            // Captura inmediatamente el resultado para evitar rechazos
            // sin manejar mientras observamos el bloqueo.
            const secondOperation = deletionFirst
              ? runOperation(secondUnitOfWork)
              : runDeletion(secondUnitOfWork);

            pending = secondOperation.then(
              (): Outcome => ({ ok: true }),
              (error: unknown): Outcome => ({ ok: false, error }),
            );

            // La segunda conexión debe esperar a la primera.
            await waitForBlocked(fixture);

            await client.query('COMMIT');
            transactionOpen = false;

            const outcome = await pending;

            if (deletionFirst && (operation === 'recovery' || operation === 'preferences')) {
              // Recuperación y preferencias deben rechazar una cuenta borrada.
              assert.equal(outcome.ok, false);
              if (outcome.ok) {
                assert.fail('La operación debía rechazar la cuenta eliminada');
              }
              assert.ok(outcome.error instanceof ProfileError);
              assert.equal(outcome.error.code, 'ACCOUNT_DELETED');
            } else if (!outcome.ok) {
              // El registro tardío se ignora; el borrado debe completar.
              throw outcome.error;
            }
          } finally {
            try {
              if (transactionOpen) {
                await client.query('ROLLBACK');
              }
            } catch (error) {
              discardClient = true;
              throw error;
            } finally {
              // Libera el bloqueo antes de esperar la segunda conexión.
              client.release(discardClient);
              await pending;
            }
          }

          // Ninguna de estas operaciones puede dejar datos recreados.
          for (const table of [
            'user_profiles',
            'user_preferences',
            'user_achievements',
            'notifications',
          ]) {
            const result = await fixture.first.query(
              `SELECT COUNT(*)::int AS total FROM ${table}
                WHERE user_id = $1`,
              ['7'],
            );
            assert.equal(result.rows[0].total, 0, table);
          }

          const erased = await fixture.first.query(
            'SELECT user_id FROM erased_users WHERE user_id = $1',
            ['7'],
          );
          assert.deepEqual(erased.rows, [{ user_id: '7' }]);

          const otherAfter = await fixture.first.query(
            `SELECT row_to_json(p) AS profile, row_to_json(pr) AS preferences
               FROM user_profiles p
               JOIN user_preferences pr USING (user_id)
              WHERE p.user_id = '8'`,
          );
          assert.deepEqual(otherAfter.rows, otherBefore.rows);
        });
      });
    }
  }
});