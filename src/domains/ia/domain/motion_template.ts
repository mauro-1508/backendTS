/**
 * Logica del motor de plantillas de movimiento del frontend, copiada 1:1.
 *
 * Fuentes (frontendTS, src/feature/Translation/services/vision/):
 *   - normalize.ts          -> normalizeLandmarks
 *   - motionTemplateStore.ts -> SEQ_LEN, FRAME_DIM, GestureTemplate
 *   - motionClassifier.ts   -> resampleSequence, dtwDistance, MAX_GESTURE_DISTANCE,
 *                              gestureConfidence
 *
 * Si cambia alli, debe cambiar aqui: plantillas normalizadas distinto no se
 * reconocen en la app.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export const SEQ_LEN = 16;
export const FRAME_DIM = 63;

/** Distancia DTW maxima para aceptar una palabra (motionClassifier.ts). */
export const MAX_GESTURE_DISTANCE = 1.1;
/** La app solo emite la palabra si la confianza es >= 0.7 (motionClassifier.ts). */
export const MIN_WORD_CONFIDENCE = 0.7;

export interface GestureTemplate {
  label: string;
  frames: number[][];
  createdAt: string;
}

export const normalizeLandmarks = (landmarks: Landmark[]): Float32Array => {
  const out = new Float32Array(FRAME_DIM);
  if (!landmarks || landmarks.length < 21) return out;

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  const dx = middleMcp.x - wrist.x;
  const dy = middleMcp.y - wrist.y;
  const dz = middleMcp.z - wrist.z;
  const scale = Math.hypot(dx, dy, dz) || 1;

  for (let i = 0; i < 21; i++) {
    const lm = landmarks[i];
    const idx = i * 3;
    out[idx] = (lm.x - wrist.x) / scale;
    out[idx + 1] = (lm.y - wrist.y) / scale;
    out[idx + 2] = (lm.z - wrist.z) / scale;
  }

  return out;
};

/** Remuestreo a SEQ_LEN por indice redondeado (no interpola). */
export const resampleSequence = (features: Float32Array[]): number[][] | null => {
  if (features.length < 2) return null;
  const out: number[][] = [];
  for (let i = 0; i < SEQ_LEN; i++) {
    const srcIdx = Math.min(features.length - 1, Math.round((i * (features.length - 1)) / (SEQ_LEN - 1)));
    const f = features[srcIdx];
    if (f.length !== FRAME_DIM) return null;
    out.push(Array.from(f));
  }
  return out;
};

const frameDist = (a: number[], b: number[]): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
};

export const dtwDistance = (a: number[][], b: number[][]): number => {
  const n = a.length;
  const m = b.length;
  const BAND = 4;
  const INF = Number.POSITIVE_INFINITY;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  cost[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    const jMin = Math.max(1, i - BAND);
    const jMax = Math.min(m, i + BAND);
    for (let j = jMin; j <= jMax; j++) {
      const d = frameDist(a[i - 1], b[j - 1]);
      cost[i][j] = d + Math.min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1]);
    }
  }

  return cost[n][m] / ((n + m) / 2);
};

/** Confianza que la app asigna a una distancia DTW (matchWordGesture). */
export const gestureConfidence = (distance: number): number =>
  Math.min(0.95, Math.max(0.5, 1 - distance * 0.35));
