import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  mountedSchemaByService, postgresAdapterFiles, ROOT, tablesCreatedBy, tablesUsedBy,
} from './helpers/postgres_schema';

const POSTGRES_SERVICES = [
  'services/iam-service',
  'services/recognition-service',
  'services/lexicon-service',
  'services/analytics-service',
  'services/profile-service',
];

describe('helpers del esquema', () => {
  test('tablesCreatedBy ignora comentarios y entiende IF NOT EXISTS / public.', () => {
    const sql = `-- CREATE TABLE falsa (x int);\nCREATE TABLE IF NOT EXISTS public.a (id int);\n/* CREATE TABLE b */\ncreate table c (id int);`;
    assert.deepEqual(tablesCreatedBy(sql), ['a', 'c']);
  });

  test('tablesUsedBy encuentra public.x y FROM/JOIN/INTO/UPDATE sin esquema, sin falsos positivos', () => {
    const code = [
      "// UPDATE comentario sin_tabla",
      "const a = 'DELETE FROM public.t1 WHERE x = $1';",
      "const b = `SELECT code FROM usage_event, unnest(sign_codes) AS code JOIN otra ON true`;",
      "const c = 'SELECT EXTRACT(epoch FROM created_at) FROM t2';",
      "const d = 'INSERT INTO t3 (a) VALUES ($1)';",
    ].join('\n');
    assert.deepEqual(tablesUsedBy(code), ['otra', 't1', 't2', 't3', 'usage_event']);
  });
});

describe('esquema montado en docker-compose vs tablas usadas por los adaptadores Postgres', () => {
  const schemas = mountedSchemaByService();

  for (const service of POSTGRES_SERVICES) {
    test(`${service}: cada tabla usada existe en los .sql montados`, () => {
      const schema = schemas.get(service);
      assert.ok(schema, `docker-compose.yml no monta ningun .sql de ${service}`);
      assert.ok(schema.tables.size > 0, `los .sql montados de ${service} no crean tablas`);

      const missing: string[] = [];
      const files = postgresAdapterFiles(service);
      assert.ok(files.length > 0, `${service} no tiene adaptadores Postgres`);
      for (const file of files) {
        for (const table of tablesUsedBy(fs.readFileSync(file, 'utf8'))) {
          if (!schema.tables.has(table)) missing.push(`${path.relative(ROOT, file)} usa "${table}"`);
        }
      }
      assert.deepEqual(
        missing, [],
        `tablas que no existen en el esquema montado (${[...schema.tables].join(', ')}):\n${missing.join('\n')}`,
      );
    });
  }

  test('cada .sql montado existe y todos los servicios con Postgres estan cubiertos', () => {
    for (const service of schemas.keys()) assert.ok(POSTGRES_SERVICES.includes(service), `servicio no cubierto: ${service}`);
  });
});
