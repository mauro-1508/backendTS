/**
 * Lectura de las muestras rep_0 bajadas por download-lsc54-rep0.ts y
 * preparacion de cada una para el motor de plantillas.
 */
import fs from 'fs';
import path from 'path';
import { Landmark, normalizeLandmarks, resampleSequence } from '../domain/motion_template';

export const REP0_DIR = path.join(__dirname, 'datasets', 'lsc54', 'rep0');

type Coords = { x: (number | null)[]; y: (number | null)[]; z: (number | null)[] } | null;
export interface RawFrame {
  r_hand: Coords;
  l_hand: Coords;
  pose: Coords;
}

export interface Rep0Sample {
  signer: string;
  category: string;
  /** Nombre de la clase tal como viene en el dataset. */
  sign: string;
  vid: string;
  offset: number;
  frames: RawFrame[];
}

interface Record_ {
  offset: number;
  chain: string[];
  frames: RawFrame[];
}

interface WorkerState {
  id: number;
  done: boolean;
}

/**
 * Arregla los nombres que quedaron mal escritos ("NÃºmeros" en vez de
 * "Números") en las muestras bajadas antes de que el descargador leyera las
 * claves en UTF-8. Solo actua si detecta esa firma, para no danar los buenos.
 */
const repairMojibake = (s: string): string => {
  if (!/[ÃÂ][\u0080-¿]/.test(s)) return s;
  const repaired = Buffer.from(s, 'latin1').toString('utf8');
  return repaired.includes('�') ? s : repaired;
};

/**
 * La cadena de claves de cada rep_0 solo trae los niveles que se abren ahi
 * (p. ej. solo `vid_3`), asi que la ruta completa sale de la muestra anterior.
 * Un tramo que arranca a mitad del archivo no conoce el firmante hasta el
 * siguiente cambio de persona: se le asigna uno sintetico. Solo se omiten las
 * muestras cuya sena todavia no se puede saber.
 */
export const loadRep0Samples = (dir = REP0_DIR): Rep0Sample[] => {
  const statePath = path.join(dir, 'state.json');
  const workers: WorkerState[] = fs.existsSync(statePath)
    ? (JSON.parse(fs.readFileSync(statePath, 'utf8')) as { workers: WorkerState[] }).workers
    : [];

  const perWorker = workers.map(w => {
    const file = path.join(dir, `worker-${String(w.id).padStart(2, '0')}.jsonl`);
    if (!fs.existsSync(file)) return [] as Record_[];
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap(line => {
        try {
          return [JSON.parse(line) as Record_];
        } catch {
          return []; // linea a medio escribir
        }
      })
      .sort((a, b) => a.offset - b.offset);
  });

  const samples: Rep0Sample[] = [];
  let inherited: (string | null)[] | null = null;
  const fix = (s: string | null) => (s == null ? s : repairMojibake(s));
  workers.forEach((w, i) => {
    // [firmante, categoria, sena, video]; lo que todavia no se sabe queda null.
    let parts: (string | null)[] = inherited ?? [null, null, null, null];

    for (const rec of perWorker[i]) {
      const depth = rec.chain.length;
      parts = depth >= 4 ? rec.chain.slice(-4) : [...parts.slice(0, 4 - depth), ...rec.chain];

      const sign = parts[2];
      // Sin nombre de sena la muestra no sirve para nada.
      if (!sign) continue;

      samples.push({
        // Un tramo que arranca a mitad del archivo no ve el nombre del
        // firmante hasta el siguiente cambio de persona. Se le pone uno
        // sintetico: para la medicion basta con que sea alguien distinto.
        signer: fix(parts[0]) ?? `tramo_${w.id}_inicio`,
        category: fix(parts[1]) ?? 'desconocida',
        sign: repairMojibake(sign),
        vid: parts[3] ?? 'vid_?',
        offset: rec.offset,
        frames: rec.frames,
      });
    }
    // El tramo siguiente solo hereda la ruta si este ya bajo completo.
    inherited = w.done ? parts : null;
  });
  return samples;
};

// ---------------------------------------------------------------- preparacion

export type HandKey = 'r_hand' | 'l_hand';

/** Mano real: 21 puntos numericos y mas de 4 posiciones distintas (no relleno de pose). */
export const isRealHand = (c: Coords): c is NonNullable<Coords> => {
  if (!c || c.x.length !== 21) return false;
  if (c.x.some(v => v == null) || c.y.some(v => v == null) || c.z.some(v => v == null)) return false;
  return new Set(c.x.map((v, i) => `${v},${c.y[i]}`)).size > 4;
};

export const toLandmarks = (c: NonNullable<Coords>): Landmark[] =>
  c.x.map((x, i) => ({ x: x as number, y: c.y[i] as number, z: c.z[i] as number }));

/** Mano con mas frames reales en la muestra (empate: l_hand, la dominante en LSC-54). */
export const pickHand = (frames: RawFrame[]): HandKey => {
  const count = (h: HandKey) => frames.filter(f => isRealHand(f[h])).length;
  return count('r_hand') > count('l_hand') ? 'r_hand' : 'l_hand';
};

/**
 * Mano de una clase entera, por mayoria entre sus muestras.
 *
 * Hay que elegirla por clase y no por muestra: si una muestra usa la izquierda
 * y otra la derecha, las plantillas quedan espejadas entre si y el DTW las ve
 * como senas distintas (medido: elegir por muestra empeora la distancia media
 * entre muestras de la misma sena de 3,6 a 4,7).
 */
export const pickHandForSign = (samples: { frames: RawFrame[] }[]): HandKey => {
  let right = 0;
  for (const s of samples) if (pickHand(s.frames) === 'r_hand') right++;
  return right * 2 > samples.length ? 'r_hand' : 'l_hand';
};

/**
 * Secuencia de plantilla: frames con mano real de la mano elegida, recortados
 * al tramo activo, normalizados con normalize.ts y remuestreados a 16 como en
 * la app. Devuelve null si hay menos de `minFrames` frames reales.
 */
export const toTemplateFrames = (frames: RawFrame[], hand: HandKey, minFrames = 8): number[][] | null => {
  const features = frames.filter(f => isRealHand(f[hand])).map(f => normalizeLandmarks(toLandmarks(f[hand]!)));
  if (features.length < minFrames) return null;
  return resampleSequence(features);
};

/** El dataset se grabo a 30 FPS (33,3 ms por frame). */
const DATASET_FPS = 30;
/** La app muestrea la camara cada 120 ms y guarda 2,2 s (motionClassifier.ts). */
const LIVE_SAMPLE_MS = 120;
const LIVE_WINDOW_MS = 2200;

/**
 * Lo que la app veria de esta muestra en vivo: solo los ultimos 2,2 s del
 * tramo activo, muestreados cada 120 ms. Las senas largas (muchas pasan de
 * 3 s) no le caben enteras en la ventana.
 */
export const toLiveQueryFrames = (frames: RawFrame[], hand: HandKey, minSamples = 8): number[][] | null => {
  const active = frames.filter(f => isRealHand(f[hand]));
  const windowFrames = Math.round((LIVE_WINDOW_MS / 1000) * DATASET_FPS);
  const step = (LIVE_SAMPLE_MS / 1000) * DATASET_FPS;

  const tail = active.slice(Math.max(0, active.length - windowFrames));
  const picked: RawFrame[] = [];
  for (let i = 0; Math.round(i * step) < tail.length; i++) picked.push(tail[Math.round(i * step)]);
  if (picked.length < minSamples) return null;

  return resampleSequence(picked.map(f => normalizeLandmarks(toLandmarks(f[hand]!))));
};
