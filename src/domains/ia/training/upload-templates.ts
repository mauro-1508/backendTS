/**
 * Sube al backend el JSON de plantillas que produce el conversor.
 *
 * Los endpoints de creacion piden JWT, asi que o se pasa un token ya emitido
 * (`--token`) o se inicia sesion con un usuario (`--email` y `--password`).
 *
 * Uso:
 *   npm run ia:upload-templates -- --email tu@correo --password ***
 *   npm run ia:upload-templates -- --token eyJ... --file output/lsc54-templates.json
 *   npm run ia:upload-templates -- --email ... --password ... --replace
 *
 * `--replace` borra antes las plantillas de palabras que ya estan guardadas,
 * para no acumular duplicados al reimportar.
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const argStr = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const API = argStr('--api') ?? 'http://localhost:3000/api';
const FILE = argStr('--file') ?? path.join(__dirname, 'output', 'lsc54-templates.json');
const REPLACE = args.includes('--replace');
const SOURCE = argStr('--source') ?? 'lsc54';

interface Envelope<T> {
  success: boolean;
  message?: string;
  data?: T;
}

const call = async <T>(method: string, url: string, token?: string, body?: unknown): Promise<Envelope<T>> => {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: Envelope<T>;
  try {
    parsed = JSON.parse(text) as Envelope<T>;
  } catch {
    throw new Error(`${method} ${url} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${method} ${url} -> HTTP ${res.status}: ${parsed.message ?? text.slice(0, 200)}`);
  return parsed;
};

const login = async (): Promise<string> => {
  const token = argStr('--token');
  if (token) return token;

  const email = argStr('--email');
  const password = argStr('--password');
  if (!email || !password) throw new Error('Falta --token, o --email y --password');

  const res = await call<{ token: string }>('POST', '/auth/login', undefined, { email, password });
  if (!res.data?.token) throw new Error('El login no devolvio token');
  return res.data.token;
};

const main = async () => {
  if (!fs.existsSync(FILE)) throw new Error(`No existe ${FILE}. Corre primero npm run ia:convert-lsc54`);
  const { gestures } = JSON.parse(fs.readFileSync(FILE, 'utf8')) as {
    gestures: { label: string; frames: number[][] }[];
  };
  if (!gestures?.length) throw new Error('El archivo no tiene plantillas');

  const token = await login();
  console.log(`Sesion iniciada. ${gestures.length} plantillas en ${path.basename(FILE)}.`);

  if (REPLACE) {
    const existing = await call<{ templateId: number }[]>('GET', '/sign-templates?kind=motion', token);
    const ids = existing.data ?? [];
    for (const t of ids) await call('DELETE', `/sign-templates/${t.templateId}`, token);
    console.log(`Borradas ${ids.length} plantillas anteriores.`);
  }

  const res = await call<number[]>('POST', '/sign-templates', token, { gestures, kind: 'motion', source: SOURCE });
  console.log(res.message ?? 'Subidas');

  const after = await call<{ label: string }[]>('GET', '/sign-templates?kind=motion', token);
  const porPalabra = new Map<string, number>();
  for (const t of after.data ?? []) porPalabra.set(t.label, (porPalabra.get(t.label) ?? 0) + 1);
  console.log('\nEn el servidor quedan:');
  for (const [label, n] of [...porPalabra.entries()].sort()) console.log(`  ${label}: ${n}`);
};

main().catch(err => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
