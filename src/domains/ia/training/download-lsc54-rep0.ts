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
 *   npm run ia:download-lsc54 -- --solo bienvenido --out bienvenido
 *
 * Opciones: --workers (4 por defecto), --slice i/N, --max-samples N,
 * --solo <senas separadas por coma>, --out <carpeta>.
 * El servidor limita por conexion a internet, asi que repartir los tramos
 * entre maquinas distintas si acelera; subir --workers en una sola, no.
 */
import fs from 'fs';
import path from 'path';

const FILE_URL = 'https://china.scidb.cn/download?fileId=bef1a180dba2259b3bcd7de6bc62e3df';
const FILE_SIZE = 55_178_894_680;



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

const argStr = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/**
 * `--solo hola,bienvenido` baja unicamente esas senas y salta el resto.
 * Recorrer un rep sin bajarlo cuesta ~2 % de sus bytes, asi que sirve para
 * juntar todas las muestras de una palabra sin bajar el archivo entero.
 */
const ONLY = (argStr('--solo') ?? '')
  .split(',')
  .map(x => x.trim().toLowerCase())
  .filter(Boolean);

/** Carpeta de salida propia, para no mezclar con la descarga general. */
const OUT_NAME = argStr('--out');

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

const OUT_DIR = path.join(__dirname, 'datasets', 'lsc54', OUT_NAME ?? 'rep0');
const STATE_PATH = path.join(OUT_DIR, 'state.json');

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
      let beforeBuf: Buffer<ArrayBufferLike> = buf.subarray(0, m.index);
      if (beforeBuf.length < CHAIN_CONTEXT && keyPos > CHAIN_CONTEXT) {
        beforeBuf = await fetchRange(keyPos - CHAIN_CONTEXT, keyPos - 1);
      }
      // El rastreo va en latin1 (1 byte = 1 caracter) para no descuadrar las
      // posiciones, pero los nombres llevan tildes y ñ: se releen en UTF-8.
      const chainText = CHAIN_RE.exec(beforeBuf.toString('latin1'))?.[1] ?? '';
      const chainUtf8 = beforeBuf.subarray(beforeBuf.length - chainText.length).toString('utf8');
      const chain = [...chainUtf8.matchAll(/"([^"]+)":/g)].map(k => k[1]);
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
  console.log(`${new Date().toTimeString().slice(0, 8)} [w${String(w.id).padStart(2, '0')}] ${msg}`);

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
  /** [firmante, categoria, sena, video]: la cadena solo trae lo que se abre. */
  let parts: (string | null)[] = [null, null, null, null];
  /** Con --solo: true mientras se esta atravesando una sena que no interesa. */
  let skipping = false;
  let lastSave = Date.now();
  /** Cuantas reps trae cada video (3, 5...): permite saltarlos de una. */
  let repsPerVid = 1;
  let vidStart: number | null = null;

  while (!w.done && !stopping) {
    const res = await scanNextRep(w.pos);

    if (res.kind === 'eof') {
      w.done = true;
      break;
    }

    if (res.kind === 'rep') {
      // Saltandose una sena que no interesa: pasarse de largo da igual, lo
      // unico que no se puede es saltarse el rep_0 del proximo video. Se
      // reestima el tamano con el promedio y se sigue, sin retroceder.
      if (skipping && lastKey != null && res.keyPos > lastKey) {
        repSize = Math.floor((res.keyPos - lastKey) / Math.max(1, res.n - (lastN ?? 0)));
        lastKey = res.keyPos;

        if (vidStart != null && res.n < lastN!) {
          // Caimos en otro video sin ver su rep_0: hay que volver por el, no
          // sea que sea una de las senas buscadas.
          w.pos = Math.max(vidStart + 1, res.keyPos - Math.floor(res.n * repSize * 1.02));
          vidStart = null;
          lastN = null;
          continue;
        }
        lastN = res.n;

        // Saltar lo que falta del video de una sola vez.
        const restantes = Math.max(1, repsPerVid - res.n);
        w.pos = res.keyPos + Math.floor(repSize * (restantes - 0.03));
        if (Date.now() - lastSave > 30_000) {
          saveState();
          lastSave = Date.now();
        }
        continue;
      }

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

    const depth = found.chain.length;
    parts = depth >= 4 ? found.chain.slice(-4) : [...parts.slice(0, 4 - depth), ...found.chain];
    const sign = (parts[2] ?? '').toLowerCase();

    // Con --solo, las demas senas se saltan sin bajarlas: se avanza por la
    // frontera como con las rep_1..N.
    if (ONLY.length > 0 && !ONLY.includes(sign)) {
      // Cuantas reps tuvo el video anterior: se salta de a videos enteros.
      if (vidStart != null && repSize) {
        const observadas = Math.round((found.keyPos - vidStart) / repSize);
        if (observadas >= 1 && observadas <= 60) repsPerVid = observadas;
      }
      vidStart = found.keyPos;
      skipping = true;
      lastKey = found.keyPos;
      lastN = 0;
      w.pos = repSize ? found.keyPos + Math.floor(repSize * (repsPerVid - 0.03)) : found.keyPos + 1;
      // El avance tambien se guarda: sin esto, horas de recorrido se pierden
      // si el proceso se corta.
      if (Date.now() - lastSave > 30_000) {
        saveState();
        lastSave = Date.now();
      }
      continue;
    }

    skipping = false;

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
      `${parts.filter(Boolean).join('/') || '(sigue)'} ${frames.length} frames, ` +
        `${((end - found.objStart) / 1e6).toFixed(1)} MB | total ${total}`,
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
