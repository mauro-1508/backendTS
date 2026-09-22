/**
 * Inspecciona el dataset LSC-54 y documenta su formato real.
 *
 * Recorre el JSON por streaming (datos.json pesa ~55 GB, no cabe en memoria),
 * arma cada muestra (`rep_N`) completa y calcula:
 *   - arbol signer -> categoria -> sena -> muestras
 *   - frames por muestra
 *   - por frame y mano: si los 21 puntos son reales, relleno copiado de la
 *     pose (<= 4 puntos distintos) o nulos
 *   - rangos de x, y, z de las manos reales
 *   - que mano domina en cada muestra
 *
 * Uso:
 *   npx ts-node src/domains/ia/training/inspect-lsc54.ts [ruta.json] [--limit N]
 * Deja un resumen en training/output/lsc54-inspection.json.
 */
import fs from 'fs';
import path from 'path';
import { parser } from 'stream-json';
import Assembler from 'stream-json/Assembler';

type Token = Parameters<Assembler['consume']>[0];

type Coords = { x?: (number | null)[]; y?: (number | null)[]; z?: (number | null)[] };
type Frame = Record<string, Coords>;
type Sample = Record<string, Frame>;

type HandState = 'real' | 'filler' | 'null' | 'missing';

const HANDS = ['r_hand', 'l_hand'] as const;
type HandKey = (typeof HANDS)[number];

const TRAINING_DIR = __dirname;
const DEFAULT_INPUT = path.join(TRAINING_DIR, 'datasets', 'lsc54', 'sample.json');
const REPORT_PATH = path.join(TRAINING_DIR, 'output', 'lsc54-inspection.json');

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const input = args.find((a, i) => !a.startsWith('--') && i !== limitIdx + 1) ?? DEFAULT_INPUT;

// ---------------------------------------------------------------- analisis

/** Un mano "real" tiene 21 puntos numericos y mas de 4 posiciones distintas. */
const classifyHand = (c: Coords | undefined): HandState => {
  if (!c) return 'missing';
  const { x = [], y = [], z = [] } = c;
  if (x.length === 0 || x.some(v => v == null) || y.some(v => v == null) || z.some(v => v == null)) return 'null';
  const distinct = new Set(x.map((v, i) => `${v},${y[i]}`)).size;
  return distinct <= 4 ? 'filler' : 'real';
};

class Range {
  min = Infinity;
  max = -Infinity;
  add(values: (number | null)[] | undefined) {
    for (const v of values ?? []) {
      if (v == null) continue;
      if (v < this.min) this.min = v;
      if (v > this.max) this.max = v;
    }
  }
  toJSON() {
    return this.min === Infinity ? null : { min: +this.min.toFixed(4), max: +this.max.toFixed(4) };
  }
}

class Stats {
  n = 0;
  sum = 0;
  min = Infinity;
  max = -Infinity;
  add(v: number) {
    this.n++;
    this.sum += v;
    if (v < this.min) this.min = v;
    if (v > this.max) this.max = v;
  }
  toJSON() {
    return this.n ? { min: this.min, mean: +(this.sum / this.n).toFixed(1), max: this.max, n: this.n } : null;
  }
}

interface SignSummary {
  category: string;
  samples: number;
  signers: Set<string>;
  frames: Stats;
  realFrames: Record<HandKey, Stats>;
  dominant: Record<HandKey | 'none', number>;
  twoHanded: number;
}

const report = {
  input,
  samples: 0,
  tree: {} as Record<string, Record<string, Record<string, number>>>,
  frames: new Stats(),
  frameKeysContiguous: true,
  partKeys: {} as Record<string, number>,
  partLengths: {} as Record<string, Record<string, number>>,
  handStates: {
    r_hand: { real: 0, filler: 0, null: 0, missing: 0 },
    l_hand: { real: 0, filler: 0, null: 0, missing: 0 },
  } as Record<HandKey, Record<HandState, number>>,
  realRanges: { x: new Range(), y: new Range(), z: new Range() },
  wristZ: new Range(),
  exampleFrame: null as unknown,
  signs: {} as Record<string, SignSummary>,
};

const bump = (obj: Record<string, number>, key: string) => {
  obj[key] = (obj[key] ?? 0) + 1;
};

/** Suma del desplazamiento de la muneca entre frames reales consecutivos. */
const wristTravel = (frames: Frame[], hand: HandKey): number => {
  let travel = 0;
  let prev: [number, number] | null = null;
  for (const f of frames) {
    if (classifyHand(f[hand]) !== 'real') {
      prev = null;
      continue;
    }
    const cur: [number, number] = [f[hand].x![0]!, f[hand].y![0]!];
    if (prev) travel += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    prev = cur;
  }
  return travel;
};

const analyzeSample = ([signer, category, sign]: string[], sample: Sample) => {
  report.samples++;
  report.tree[signer] ??= {};
  report.tree[signer][category] ??= {};
  bump(report.tree[signer][category], sign);

  const keys = Object.keys(sample);
  const expected = keys.map((_, i) => `frame_${i}`);
  if (keys.some((k, i) => k !== expected[i])) report.frameKeysContiguous = false;
  const frames = keys.map(k => sample[k]);
  report.frames.add(frames.length);

  const real: Record<HandKey, number> = { r_hand: 0, l_hand: 0 };
  let bothReal = 0;
  for (const frame of frames) {
    for (const part of Object.keys(frame)) {
      bump(report.partKeys, part);
      report.partLengths[part] ??= {};
      bump(report.partLengths[part], String(frame[part]?.x?.length ?? 0));
    }
    for (const hand of HANDS) {
      const state = classifyHand(frame[hand]);
      report.handStates[hand][state]++;
      if (state === 'real') {
        real[hand]++;
        report.realRanges.x.add(frame[hand].x);
        report.realRanges.y.add(frame[hand].y);
        report.realRanges.z.add(frame[hand].z);
        report.wristZ.add([frame[hand].z![0]]);
        if (!report.exampleFrame) report.exampleFrame = { signer, category, sign, frame };
      }
    }
    if (classifyHand(frame.r_hand) === 'real' && classifyHand(frame.l_hand) === 'real') bothReal++;
  }

  const s = (report.signs[sign] ??= {
    category,
    samples: 0,
    signers: new Set(),
    frames: new Stats(),
    realFrames: { r_hand: new Stats(), l_hand: new Stats() },
    dominant: { r_hand: 0, l_hand: 0, none: 0 },
    twoHanded: 0,
  });
  s.samples++;
  s.signers.add(signer);
  s.frames.add(frames.length);
  s.realFrames.r_hand.add(real.r_hand);
  s.realFrames.l_hand.add(real.l_hand);

  // Mano dominante: la que mas se mueve entre las que aparecen.
  const travel = { r_hand: wristTravel(frames, 'r_hand'), l_hand: wristTravel(frames, 'l_hand') };
  if (real.r_hand === 0 && real.l_hand === 0) s.dominant.none++;
  else s.dominant[travel.r_hand >= travel.l_hand ? 'r_hand' : 'l_hand']++;

  // Bimanual: ambas manos reales en al menos la mitad de los frames activos.
  const active = Math.max(real.r_hand, real.l_hand);
  if (active > 0 && bothReal >= active * 0.5) s.twoHanded++;
};

// ---------------------------------------------------------------- streaming

const SAMPLE_DEPTH = 5; // signer / categoria / sena / vid_N / rep_N

const run = () =>
  new Promise<void>((resolve, reject) => {
    const tokens = parser({ packKeys: true, packValues: true, streamKeys: false, streamValues: false });
    const stack: (string | null)[] = [];
    let asm: Assembler | null = null;
    let samplePath: string[] = [];
    let stopped = false;

    const input$ = fs.createReadStream(input);
    tokens.on('data', (token: Token) => {
      if (stopped) return;

      if (asm) {
        asm.consume(token);
        if (asm.done) {
          analyzeSample(samplePath, asm.current as Sample);
          asm = null;
          if (report.samples >= limit) {
            stopped = true;
            input$.destroy();
            resolve();
          }
        }
        return;
      }

      switch (token.name) {
        case 'keyValue':
          stack[stack.length - 1] = token.value as string;
          break;
        case 'startObject':
          if (stack.length === SAMPLE_DEPTH) {
            samplePath = stack as string[];
            samplePath = [...samplePath];
            asm = new Assembler();
            asm.consume(token);
          } else {
            stack.push(null);
          }
          break;
        case 'startArray':
          stack.push(null);
          break;
        case 'endObject':
        case 'endArray':
          stack.pop();
          break;
      }
    });
    tokens.on('end', resolve);
    tokens.on('error', reject);
    input$.on('error', reject);
    input$.pipe(tokens);
  });

// ---------------------------------------------------------------- salida

const printReport = () => {
  const signs = Object.entries(report.signs).sort(
    ([, a], [, b]) => a.category.localeCompare(b.category) || b.samples - a.samples,
  );

  console.log(`\nArchivo: ${input}`);
  console.log(`Muestras (rep): ${report.samples}`);
  console.log(`Firmantes: ${Object.keys(report.tree).join(', ')}`);
  console.log(`Frames por muestra: ${JSON.stringify(report.frames)}`);
  console.log(`Claves frame_0..frame_N contiguas: ${report.frameKeysContiguous}`);
  console.log(`Partes por frame: ${JSON.stringify(report.partKeys)}`);
  console.log(`Longitud de x por parte: ${JSON.stringify(report.partLengths)}`);
  console.log(`Estado de las manos por frame: ${JSON.stringify(report.handStates)}`);
  console.log(`Rangos en manos reales: ${JSON.stringify(report.realRanges)}  z de la muneca: ${JSON.stringify(report.wristZ)}`);

  console.log('\nSena | categoria | muestras | firmantes | frames min/media/max | frames reales r/l (media) | domina r/l/ninguna | bimanual');
  for (const [name, s] of signs) {
    const f = s.frames.toJSON()!;
    console.log(
      [
        name,
        s.category,
        s.samples,
        s.signers.size,
        `${f.min}/${f.mean}/${f.max}`,
        `${s.realFrames.r_hand.toJSON()?.mean}/${s.realFrames.l_hand.toJSON()?.mean}`,
        `${s.dominant.r_hand}/${s.dominant.l_hand}/${s.dominant.none}`,
        `${s.twoHanded}/${s.samples}`,
      ].join(' | '),
    );
  }

  const example = report.exampleFrame as { frame: Frame } | null;
  if (example) {
    const schema = Object.fromEntries(
      Object.entries(example.frame).map(([part, c]) => [part, Object.fromEntries(Object.entries(c).map(([k, v]) => [k, `number[${v?.length}]`]))]),
    );
    console.log(`\nEsquema de un frame: ${JSON.stringify(schema)}`);
  }
};

run()
  .then(() => {
    printReport();
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    const serializable = {
      ...report,
      signs: Object.fromEntries(
        Object.entries(report.signs).map(([k, s]) => [k, { ...s, signers: [...s.signers].sort() }]),
      ),
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(serializable, null, 2));
    console.log(`\nResumen guardado en ${REPORT_PATH}`);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
