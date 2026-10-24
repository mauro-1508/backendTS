import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Quita los comentarios de bloque recorriendo el texto. Con una regex del tipo
 * `[\s\S]*?` el motor puede retroceder de forma cuadratica en archivos grandes.
 */
const stripBlockComments = (text: string): string => {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('/*', i);
    if (start === -1) return out + text.slice(i);
    out += text.slice(i, start);
    const end = text.indexOf('*/', start + 2);
    if (end === -1) return out;
    i = end + 2;
  }
  return out;
};

/** Corta cada linea en el primer marcador de comentario que `isComment` acepte. */
const stripLineComments = (text: string, marker: string, isComment: (line: string, at: number) => boolean): string =>
  text
    .split('\n')
    .map(line => {
      for (let at = line.indexOf(marker); at !== -1; at = line.indexOf(marker, at + 1)) {
        if (isComment(line, at)) return line.slice(0, at);
      }
      return line;
    })
    .join('\n');

/** Quita comentarios SQL (`-- ...`) y de bloque para no extraer nombres de ejemplos. */
const stripSqlComments = (sql: string): string => stripLineComments(stripBlockComments(sql), '--', () => true);

/**
 * Quita comentarios TS/JS (`// ...` y bloque) para no contar tablas citadas en explicaciones.
 * Un `//` pegado a `:` o a una comilla es parte de una URL o de un texto, no un comentario.
 */
const stripCodeComments = (code: string): string =>
  stripLineComments(stripBlockComments(code), '//', (line, at) => at === 0 || !":'\"`".includes(line[at - 1]));

/** `- ./services/<x>/db/<archivo>.sql:/docker-entrypoint-initdb.d/...` -> servicio y archivo. */
const parseInitdbMount = (line: string): { service: string; file: string } | null => {
  const item = line.trim();
  if (!item.startsWith('-')) return null;
  const [source, target] = item.slice(1).trim().split(':');
  if (!source?.startsWith('./services/') || !target?.startsWith('/docker-entrypoint-initdb.d/')) return null;
  const parts = source.slice(2).split('/');
  if (parts.length < 4 || parts[2] !== 'db' || !source.endsWith('.sql')) return null;
  return { service: parts.slice(0, 2).join('/'), file: parts.slice(2).join('/') };
};

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
  return [...new Set(names)].filter(name => !NOT_TABLES.has(name) && !ctes.has(name)).sort((a, b) => a.localeCompare(b));
};

/**
 * Esquema que realmente se monta en cada Postgres segun docker-compose.yml: servicio (carpeta
 * `services/<x>`) -> tablas creadas por los .sql montados en initdb. Lee las lineas de volumen
 * `./services/<x>/db/<archivo>.sql:/docker-entrypoint-initdb.d/...`.
 */
export const mountedSchemaByService = (): Map<string, { files: string[]; tables: Set<string> }> => {
  const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  const result = new Map<string, { files: string[]; tables: Set<string> }>();
  for (const mount of compose.split('\n').map(parseInitdbMount)) {
    if (!mount) continue;
    const { service, file } = mount;
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
  return found.sort((a, b) => a.localeCompare(b));
};
