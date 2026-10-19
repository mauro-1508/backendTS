import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { Pool } from 'pg';
import { exportIdentities } from '../cmd/export_identities';

type IdentityRow = {
  user_id: number;
  email: string;
  name: string | null;
};

type RecordedQuery = {
  text: string;
  values?: unknown[];
};

// Simula únicamente la conexión para comprobar cómo el exportador
// pagina, construye el resultado y administra la transacción.
// No demuestra el aislamiento de PostgreSQL real.
const makeFixture = (
  rows: IdentityRow[],
  failOnPage = false,
) => {
  const queries: RecordedQuery[] = [];
  let released = false;

  const client = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });

      if (text.includes('transaction_timestamp()')) {
        return {
          rows: [{
            exported_at: new Date('2020-01-01T00:00:00.000Z'),
          }],
        };
      }

      if (text.includes('FROM public.users')) {
        if (failOnPage) {
          throw new Error('Fallo de lectura simulado');
        }

        const after = Number(values?.[0]);
        const limit = Number(values?.[2]);

        return {
          rows: rows
            .filter(row => row.user_id > after)
            .slice(0, limit),
        };
      }

      return { rows: [] };
    },
    release() {
      released = true;
    },
  };

  // El cast pertenece al doble de prueba: solo se usa pool.connect().
  const pool = {
    connect: async () => client,
  } as unknown as Pool;

  return {
    pool,
    queries,
    wasReleased: () => released,
  };
};

it('exporta más de una página en orden y con estados explícitos', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({
    user_id: index + 1,
    email: `account${index + 1}@example.test`,
    name: index === 0 ? null : `Cuenta ${index + 1}`,
  }));

  const test = makeFixture(rows);
  const result = await exportIdentities(
    test.pool,
    'test',
    ['ACTIVE', 'INACTIVE'],
  );

  assert.equal(result.format, 'iam-profile-recovery');
  assert.equal(result.version, 1);
  assert.equal(result.source, 'test');
  assert.equal(result.exportedAt, '2020-01-01T00:00:00.000Z');
  assert.deepEqual(result.statuses, ['ACTIVE', 'INACTIVE']);
  assert.equal(result.identities.length, 501);

  assert.deepEqual(
    result.identities.map(identity => identity.userId),
    rows.map(row => row.user_id),
  );
  assert.equal(result.identities[0].name, null);

  const pages = test.queries.filter(query =>
    query.text.includes('FROM public.users'),
  );

  // Primera página, segunda página y consulta final sin resultados.
  assert.equal(pages.length, 3);
  assert.deepEqual(
    pages.map(query => query.values?.[0]),
    [0, 500, 501],
  );

  for (const page of pages) {
    assert.deepEqual(page.values?.[1], ['ACTIVE', 'INACTIVE']);
    assert.equal(page.values?.[2], 500);
    assert.match(page.text, /status = ANY\(\$2::text\[\]\)/);
    assert.match(page.text, /ORDER BY user_id ASC/);
    assert.match(page.text, /LIMIT \$3/);
  }

  assert.equal(
    test.queries[0].text,
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  assert.equal(
    test.queries[test.queries.length - 1].text,
    'COMMIT',
  );
  assert.equal(test.wasReleased(), true);
});

it('proyecta únicamente userId, email y name', async () => {
  // Añade campos extra al resultado simulado para comprobar
  // que no se copian accidentalmente al archivo exportado.
  const row = {
    user_id: 7,
    email: 'account@example.test',
    name: 'Cuenta',
    password: 'valor-ficticio-no-exportable',
    roles: ['ADMIN'],
  };

  const test = makeFixture([row]);
  const result = await exportIdentities(
    test.pool,
    'test',
    ['ACTIVE'],
  );

  assert.deepEqual(result.identities, [{
    userId: 7,
    email: 'account@example.test',
    name: 'Cuenta',
  }]);

  const page = test.queries.find(query =>
    query.text.includes('FROM public.users'),
  );

  assert.ok(page);
  assert.match(page.text, /SELECT user_id, email, name/);
});

it('admite una exportación sin cuentas', async () => {
  const test = makeFixture([]);
  const result = await exportIdentities(
    test.pool,
    'test',
    ['BLOCKED'],
  );

  assert.deepEqual(result.identities, []);
  assert.deepEqual(result.statuses, ['BLOCKED']);
  assert.equal(
    test.queries[test.queries.length - 1].text,
    'COMMIT',
  );
  assert.equal(test.wasReleased(), true);
});

it('hace rollback y libera la conexión si falla una página', async () => {
  const test = makeFixture([], true);

  await assert.rejects(
    exportIdentities(test.pool, 'test', ['ACTIVE']),
    /Fallo de lectura simulado/,
  );

  assert.equal(
    test.queries.some(query => query.text === 'COMMIT'),
    false,
  );
  assert.equal(
    test.queries[test.queries.length - 1].text,
    'ROLLBACK',
  );
  assert.equal(test.wasReleased(), true);
});