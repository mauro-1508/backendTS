import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

/** Solo la instancia exclusiva conocida; nunca usa DB_* ni carga .env. */
export async function withIsolatedPostgres(work: (first: Pool, second: Pool) => Promise<void>) {
  const url = new URL(process.env.PROFILE_TEST_DATABASE_URL!);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55437');
  assert.equal(url.pathname, '/profile_gamification_test');
  assert.equal(decodeURIComponent(url.username), 'gamification_test');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  const schema = `deletion_${randomUUID().replace(/-/g, '')}`;
  const config = { connectionString: url.toString(), max: 1, connectionTimeoutMillis: 2000,
    statement_timeout: 10000, lock_timeout: 8000 };
  const admin = new Pool(config);
  const first = new Pool({ ...config, options: `-c search_path=${schema}` });
  const second = new Pool({ ...config, options: `-c search_path=${schema}` });
  let created = false;
  try {
    const { rows } = await admin.query('SELECT current_database() AS database, current_user AS username');
    assert.deepEqual(rows, [{ database: 'profile_gamification_test', username: 'gamification_test' }]);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await work(first, second);
  } finally {
    await Promise.all([first.end(), second.end()]);
    // Solo el esquema aleatorio creado por esta invocación.
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}
