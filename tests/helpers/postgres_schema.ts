import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');

/** Quita comentarios SQL (`-- ...`) y de bloque para no extraer nombres de ejemplos. */
const stripSqlComments = (sql: string): string => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

/** Quita comentarios TS/JS (`// ...` y bloque) para no contar tablas citadas en explicaciones. */
const stripCodeComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;

export const tablesCreatedBy = (sql: string): string[] =>
  [...stripSqlComments(sql).matchAll(CREATE_TABLE)].map(match => match[1].toLowerCase());

const QUALIFIED = /\bpublic\.([a-z_][a-z0-9_]*)/g;
// Sin esquema: solo tras palabras SQL en mayuscula, y nunca funciones (`unnest(`) ni EXTRACT(x FROM col).
const UNQUALIFIED = /(?<!EXTRACT\([a-z_]+ )\b(?:(?:FROM|JOIN|UPDATE)\s+([a-z_][a-z0-9_]*)(?![\w.])(?!\s*\()|INTO\s+([a-z_][a-z0-9_]*)(?![\w.]))/g;
// CTE (`WITH x AS (` / `, x AS (`): nombre local de la consulta, no una tabla.
const CTE_NAME = /\b([a-z_][a-z0-9_]*)\s+AS\s*\(/gi;
const NOT_TABLES = new Set(['select', 'only', 'lateral', 'unnest']);

export const tablesUsedBy = (code: string): string[] => {
  const source = stripCodeComments(code);
  const ctes = new Set([...source.matchAll(CTE_NAME)].map(match => match[1].toLowerCase()));
  const names = [...source.matchAll(QUALIFIED), ...source.matchAll(UNQUALIFIED)].map(match => (match[1] ?? match[2]).toLowerCase());
  return [...new Set(names)].filter(name => !NOT_TABLES.has(name) && !ctes.has(name)).sort();
};

/**
 * Esquema que realmente se monta en cada Postgres segun docker-compose.yml: servicio (carpeta
 * `services/<x>`) -> tablas creadas por los .sql montados en initdb. Lee las lineas de volumen
 * `./services/<x>/db/<archivo>.sql:/docker-entrypoint-initdb.d/...`.
 */
export const mountedSchemaByService = (): Map<string, { files: string[]; tables: Set<string> }> => {
  const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  const mount = /^\s*-\s*\.\/(services\/[^/\s]+)\/(db\/[^:\s]+\.sql):\/docker-entrypoint-initdb\.d\//gm;
  const result = new Map<string, { files: string[]; tables: Set<string> }>();
  for (const [, service, file] of compose.matchAll(mount)) {
    const entry = result.get(service) ?? { files: [], tables: new Set<string>() };
    entry.files.push(file);
    const sql = fs.readFileSync(path.join(ROOT, service, file), 'utf8');
    tablesCreatedBy(sql).forEach(table => entry.tables.add(table));
    result.set(service, entry);
  }
  return result;
};

/** Archivos `src/**\/adapters/outbound/postgres/*.ts` de un servicio. */
export const postgresAdapterFiles = (service: string): string[] => {
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && /[\\/]adapters[\\/]outbound[\\/]postgres$/.test(dir)) found.push(full);
    }
  };
  walk(path.join(ROOT, service, 'src'));
  return found.sort();
};
