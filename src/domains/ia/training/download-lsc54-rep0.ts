/**
 * Descarga solo `rep_0` de cada video de LSC-54 (datos.json, 55 GB) usando
 * peticiones HTTP por rangos.
 *
 * Por que solo rep_0: las demas `rep_n` son la misma grabacion desplazada en x
 * (aumentacion del dataset); despues de `normalize.ts` son identicas.
 *
 * Como: el archivo se reparte en N tramos, cada uno con su propio trabajador.
 * Un trabajador busca el siguiente `"rep_0": {`, lo lee completo contando
 * llaves y recorre las fronteras entre reps sin leerlas enteras (todas las reps de un
 * video pesan casi lo mismo). La cantidad de reps por video varia (3, 5, ...).
 *
 * De cada frame se guarda r_hand, l_hand y pose (la cara es el 84 % de los
 * bytes y el motor no la usa). Es reanudable: el estado queda en
 * datasets/lsc54/rep0/state.json y cada muestra en worker-XX.jsonl.
 *
 * Uso:
 *   npm run ia:download-lsc54                          # todo el archivo
 *   npm run ia:download-lsc54 -- --slice 1/2           # primera mitad (maquina A)
 *   npm run ia:download-lsc54 -- --slice 2/2           # segunda mitad (maquina B)
 *   npm run ia:download-lsc54 -- --slice 1/2 --max-samples 800
 *
 * Opciones: --workers (4 por defecto), --slice i/N, --max-samples N.
 * El servidor limita por conexion a internet, asi que repartir los tramos
 * entre maquinas distintas si acelera; subir --workers en una sola, no.
 */
import fs from 'fs';
import path from 'path';

const FILE_URL = 'https://china.scidb.cn/download?fileId=bef1a180dba2259b3bcd7de6bc62e3df';
const FILE_SIZE = 55_178_894_680;

const OUT_DIR = path.join(__dirname, 'datasets', 'lsc54', 'rep0');
const STATE_PATH = path.join(OUT_DIR, 'state.json');

/** Lecturas grandes: el servidor corta (HTTP 429) si se le piden muchas seguidas. */
const SCAN_WINDOW = 256 * 1024;
const READ_CHUNK = 4 * 1024 * 1024;
/** Bytes que se leen antes de un rep_0 para capturar las claves que lo abren. */
const CHAIN_CONTEXT = 2048;
/** Fraccion de una rep que se salta antes de buscar la siguiente clave. */
const STEP_FRACTION = 0.985;
/** Espera minima cuando el servidor responde 429 y no dice cuanto esperar. */
const RATE_LIMIT_WAIT_MS = 60_000;
const KEPT_PARTS = ['r_hand', 'l_hand', 'pose'] as const;

const args = process.argv.slice(2);
const argNum = (name: string, def: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const WORKERS = argNum('--workers', 4);
const MAX_SAMPLES = argNum('--max-samples', Infinity);

/**
 * `--slice i/N` reparte el archivo entre varias maquinas: cada una baja su
 * parte (i de N) y despues se juntan los .jsonl. El limite del servidor es por
 * conexion a internet, asi que dos maquinas distintas suman velocidad.
 */
const sliceArg = args.indexOf('--slice');
const [SLICE_I, SLICE_N] = sliceArg >= 0 ? args[sliceArg + 1].split('/').map(Number) : [1, 1];
if (!(SLICE_I >= 1 && SLICE_I <= SLICE_N)) throw new Error('--slice i/N invalido');
const SLICE_START = Math.floor((FILE_SIZE * (SLICE_I - 1)) / SLICE_N);
const SLICE_END = Math.floor((FILE_SIZE * SLICE_I) / SLICE_N);

interface WorkerState {
  id: number;
  start: number;
  end: number;
  /** Desde donde seguir buscando el proximo rep_0. */
  pos: number;
  done: boolean;
  samples: number;
  bytes: number;
}

interface State {
  url: string;
  slice: string;
  workers: WorkerState[];
}

// ---------------------------------------------------------------- red

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Rango inclusivo [from, to], con reintentos.
 *
 * Un 429 ("vas muy rapido") no gasta intentos: se espera lo que pida el
 * servidor en `Retry-After` y se vuelve a intentar. Asi una limitacion
 * temporal no mata al trabajador.
 */
const fetchRange = async (from: number, to: number): Promise<Buffer> => {
  const last = Math.min(to, FILE_SIZE - 1);
  let attempt = 0;
  let waits = 0;
  for (;;) {
    try {
      const res = await fetch(FILE_URL, {
        headers: { Range: `bytes=${from}-${last}`, 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(180_000),
      });
      if (res.status === 429 || res.status === 503) {
        if (++waits > 30) throw new Error(`HTTP ${res.status} persistente`);
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Math.max(RATE_LIMIT_WAIT_MS, (retryAfter || 0) * 1000));
        continue;
      }
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length !== last - from + 1) throw new Error(`short read ${buf.length}/${last - from + 1}`);
      return buf;
    } catch (err) {
      if (++attempt >= 10) throw err;
      await sleep(Math.min(60_000, 2_000 * 2 ** attempt));
    }
  }
};

// ---------------------------------------------------------------- busqueda

const REP_RE = /"rep_(\d+)":\s*\{/g;
/** Claves `"k": {` encadenadas justo antes del rep_0 (signer/categoria/sena/vid). */
const CHAIN_RE = /((?:"[^"]+":\s*\{\s*)+)$/;

interface Found {
  keyPos: number;
  objStart: number;
  chain: string[];
}

type ScanResult = { kind: 'rep0'; found: Found } | { kind: 'rep'; n: number; keyPos: number } | { kind: 'eof' };

/** Primer `"rep_N": {` a partir de `pos`. */
const scanNextRep = async (pos: number): Promise<ScanResult> => {
  let carryStart = pos;
  let carry = Buffer.alloc(0);
  let cur = pos;
  while (cur < FILE_SIZE) {
    const chunk = await fetchRange(cur, cur + SCAN_WINDOW - 1);
    const buf = Buffer.concat([carry, chunk]);
    const text = buf.toString('latin1');
    REP_RE.lastIndex = 0;
    const m = REP_RE.exec(text);
    if (m) {
      const n = Number(m[1]);
      const keyPos = carryStart + m.index;
      if (n !== 0) return { kind: 'rep', n, keyPos };

      // Contexto suficiente para leer la cadena de claves que abre este rep_0.
      let before = text.slice(0, m.index);
      if (before.length < CHAIN_CONTEXT && keyPos > CHAIN_CONTEXT) {
        const prefix = await fetchRange(keyPos - CHAIN_CONTEXT, keyPos - 1);
        before = prefix.toString('latin1');
      }
      const chainText = CHAIN_RE.exec(before)?.[1] ?? '';
      const chain = [...chainText.matchAll(/"([^"]+)":/g)].map(k => k[1]);
      return { kind: 'rep0', found: { keyPos, objStart: keyPos + m[0].length - 1, chain } };
    }
    // Se guarda la cola por si una clave quedo partida entre dos ventanas.
    carry = buf.subarray(Math.max(0, buf.length - 64));
    carryStart = cur + chunk.length - carry.length;
    cur += chunk.length;
  }
  return { kind: 'eof' };
};

/** Lee el objeto que empieza en `objStart` (una `{`) contando llaves. */
const readObject = async (objStart: number): Promise<{ text: string; end: number }> => {
  const parts: string[] = [];
  let depth = 0;
  let cur = objStart;
  while (cur < FILE_SIZE) {
    const chunk = (await fetchRange(cur, cur + READ_CHUNK - 1)).toString('latin1');
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (c === 123) depth++;
      else if (c === 125 && --depth === 0) {
        parts.push(chunk.slice(0, i + 1));
        return { text: parts.join(''), end: cur + i + 1 };
      }
    }
    parts.push(chunk);
    cur += chunk.length;
  }
  throw new Error(`objeto sin cerrar desde ${objStart}`);
};

// ---------------------------------------------------------------- muestra

type Coords = { x: (number | null)[]; y: (number | null)[]; z: (number | null)[] };

const round = (v: number | null) => (v == null ? null : Math.round(v * 1e5) / 1e5);

/** Deja solo manos y pose, en el mismo formato por columnas del dataset. */
const compactFrames = (rep: Record<string, Record<string, Coords>>) =>
  Object.keys(rep)
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
    .map(k =>
      Object.fromEntries(
        KEPT_PARTS.map(part => {
          const c = rep[k][part];
          return [part, c ? { x: c.x.map(round), y: c.y.map(round), z: c.z.map(round) } : null];
        }),
      ),
    );

// ---------------------------------------------------------------- trabajador

const loadState = (): State => {
  const slice = `${SLICE_I}/${SLICE_N}`;
  if (fs.existsSync(STATE_PATH)) {
    const saved = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as State;
    if (saved.slice !== slice) {
      throw new Error(
        `El estado guardado es del tramo ${saved.slice} y ahora se pidio ${slice}. ` +
          `Usa el mismo tramo para continuar, o mueve ${OUT_DIR} a otro lado para empezar de cero.`,
      );
    }
    return saved;
  }
  const size = Math.ceil((SLICE_END - SLICE_START) / WORKERS);
  return {
    url: FILE_URL,
    slice,
    workers: Array.from({ length: WORKERS }, (_, id) => ({
      id,
      start: SLICE_START + id * size,
      end: Math.min(SLICE_END, SLICE_START + (id + 1) * size),
      pos: SLICE_START + id * size,
      done: false,
      samples: 0,
      bytes: 0,
    })),
  };
};

let state: State;
const saveState = () => {
  fs.writeFileSync(STATE_PATH + '.tmp', JSON.stringify(state, null, 2));
  fs.renameSync(STATE_PATH + '.tmp', STATE_PATH);
};

const log = (w: WorkerState, msg: string) =>
  console.log(`${new Date().toISOString().slice(11, 19)} [w${String(w.id).padStart(2, '0')}] ${msg}`);

/** Se enciende cuando se alcanza el tope: los demas trabajadores paran tambien. */
let stopping = false;

const runWorker = async (w: WorkerState) => {
  const outPath = path.join(OUT_DIR, `worker-${String(w.id).padStart(2, '0')}.jsonl`);
  /**
   * Inicio de la ultima rep vista y su tamano. Todas las reps de un video
   * pesan casi lo mismo (varian < 0,5 %), asi que desde el inicio de una rep_n
   * se salta al 98,5 % de ese tamano y se lee solo la frontera: la clave que
   * sigue es rep_{n+1} o el rep_0 del proximo video. Nunca se salta un video.
   */
  let lastKey: number | null = null;
  let repSize: number | null = null;
  let lastN: number | null = null;

  while (!w.done && !stopping) {
    const res = await scanNextRep(w.pos);

    if (res.kind === 'eof') {
      w.done = true;
      break;
    }

    if (res.kind === 'rep') {
      if (lastN != null && res.n !== lastN + 1 && lastKey != null && w.pos > lastKey + 1) {
        // El salto paso por encima de una frontera: volver y avanzar leyendo.
        log(w, `salto largo (rep_${lastN} -> rep_${res.n}), retrocediendo`);
        w.pos = lastKey + 1;
        repSize = null;
        continue;
      }
      if (lastKey != null && res.keyPos > lastKey) repSize = res.keyPos - lastKey;
      lastKey = res.keyPos;
      lastN = res.n;
      // Sin tamano conocido (arranque a mitad de un video) se avanza leyendo.
      w.pos = repSize ? res.keyPos + Math.floor(repSize * STEP_FRACTION) : res.keyPos + 1;
      continue;
    }

    const { found } = res;
    if (found.keyPos >= w.end) {
      w.done = true;
      break;
    }

    const { text, end } = await readObject(found.objStart);
    const frames = compactFrames(JSON.parse(text));
    fs.appendFileSync(outPath, JSON.stringify({ offset: found.keyPos, chain: found.chain, frames }) + '\n');

    lastKey = found.keyPos;
    lastN = 0;
    repSize = end - found.keyPos;
    w.samples++;
    w.bytes += end - found.objStart;
    // La clave siguiente empieza justo donde termina este objeto.
    w.pos = end;
    saveState();
    const total = state.workers.reduce((s, x) => s + x.samples, 0);
    log(
      w,
      `${found.chain.join('/') || '(sigue)'} ${frames.length} frames, ${((end - found.objStart) / 1e6).toFixed(1)} MB` +
        ` | total ${total}`,
    );
    if (total >= MAX_SAMPLES) {
      log(w, `tope de ${MAX_SAMPLES} muestras alcanzado`);
      stopping = true;
      break;
    }
  }
  saveState();
  log(w, `terminado: ${w.samples} muestras`);
};

const main = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  state = loadState();
  saveState();
  const pending = state.workers.filter(w => !w.done);
  console.log(`LSC-54 rep_0: ${pending.length} trabajadores pendientes de ${state.workers.length}`);
  await Promise.all(pending.map(w => runWorker(w).catch(err => log(w, `ERROR ${err}`))));
  const total = state.workers.reduce((s, w) => s + w.samples, 0);
  console.log(`Listo: ${total} muestras rep_0 en ${OUT_DIR}`);
};

void main();
