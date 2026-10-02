/**
 * Convierte muestras de LSC-54 en el JSON de plantillas que lee la app.
 *
 * Salida compatible con `importGesturesJson()` del frontend:
 *   { version: 1, exportedAt, gestures: [{ label, frames: number[16][63], createdAt }] }
 *
 * Lo que hace con cada muestra (ver docs/06-data/datasets/lsc54.md):
 *   1. Elige la mano que trabaja, una sola para toda la clase (por mayoria).
 *   2. Descarta los frames sin mano real (relleno copiado de la pose).
 *   3. Normaliza con la misma funcion del frontend y remuestrea a 16 frames.
 *   4. Reparte las plantillas entre firmantes distintos.
 *
 * Uso:
 *   npm run ia:convert-lsc54 -- --words words.json [--max-templates 12] [--mirror]
 *
 * `--words` es un JSON { "clase_del_dataset": "Palabra que ve el usuario" }.
 * Sin el, convierte todas las clases disponibles usando su propio nombre.
 * `--mirror` invierte la mano en x (ver "quiralidad" en la documentacion: falta
 * confirmar frente a la camara si el dataset esta espejado respecto a la app).
 */
import fs from 'fs';
import path from 'path';
import { FRAME_DIM, GestureTemplate, SEQ_LEN } from '../domain/motion_template';
import { HandKey, loadRep0Samples, pickHandForSign, Rep0Sample, toTemplateFrames } from './lsc54-rep0';

const args = process.argv.slice(2);
const argStr = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const argNum = (name: string, def: number) => Number(argStr(name) ?? def);

const MAX_TEMPLATES = argNum('--max-templates', 12);
const MIRROR = args.includes('--mirror');
const WORDS_PATH = argStr('--words');
const OUT_PATH = argStr('--out') ?? path.join(__dirname, 'output', 'lsc54-templates.json');
const DIR = argStr('--dir');

const labelOf = (sign: string) => sign.trim().toLowerCase();

/** Espeja la mano en x: sobre rasgos ya centrados en la muneca, es negar la x. */
const mirrorFrames = (frames: number[][]): number[][] =>
  frames.map(f => f.map((v, i) => (i % 3 === 0 ? -v : v)));

/** Hasta `max` muestras por clase, alternando firmantes para no repetir persona. */
const spreadBySigner = <T extends { signer: string }>(samples: T[], max: number): T[] => {
  const bySigner = new Map<string, T[]>();
  for (const s of samples) bySigner.set(s.signer, [...(bySigner.get(s.signer) ?? []), s]);
  const queues = [...bySigner.keys()].sort().map(k => bySigner.get(k)!);
  const chosen: T[] = [];
  for (let round = 0; chosen.length < max && queues.some(q => q.length > round); round++) {
    for (const q of queues) if (q[round] && chosen.length < max) chosen.push(q[round]);
  }
  return chosen;
};

const main = () => {
  // Mapa clase del dataset -> palabra que ve el usuario, con las claves normalizadas.
  const words = WORDS_PATH
    ? new Map(
        Object.entries(JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8')) as Record<string, string>).map(([k, v]) => [
          labelOf(k),
          v,
        ]),
      )
    : null;

  const samples = loadRep0Samples(DIR);
  const byLabel = new Map<string, Rep0Sample[]>();
  for (const s of samples) {
    const label = labelOf(s.sign);
    if (words && !words.has(label)) continue;
    byLabel.set(label, [...(byLabel.get(label) ?? []), s]);
  }

  const gestures: GestureTemplate[] = [];
  const createdAt = new Date().toISOString();
  const report: { label: string; word: string; hand: HandKey; templates: number; signers: number; descartadas: number }[] = [];

  for (const [label, list] of [...byLabel.entries()].sort()) {
    const word = words?.get(label) ?? label;
    // Una sola mano para toda la clase: mezclarlas deja plantillas espejadas.
    const hand = pickHandForSign(list);
    let discarded = 0;
    const usable = list.filter(s => {
      const ok = toTemplateFrames(s.frames, hand) !== null;
      if (!ok) discarded++;
      return ok;
    });

    const chosen = spreadBySigner(usable, MAX_TEMPLATES);
    for (const s of chosen) {
      let frames = toTemplateFrames(s.frames, hand)!;
      if (MIRROR) frames = mirrorFrames(frames);
      gestures.push({ label: word, frames, createdAt });
    }
    report.push({
      label,
      word,
      hand,
      templates: chosen.length,
      signers: new Set(chosen.map(s => s.signer)).size,
      descartadas: discarded,
    });
  }

  // Misma validacion que hace el frontend al importar.
  const invalid = gestures.filter(
    g =>
      !g.label.trim() ||
      g.frames.length !== SEQ_LEN ||
      g.frames.some(f => f.length !== FRAME_DIM || f.some(n => typeof n !== 'number' || !Number.isFinite(n))),
  );
  if (invalid.length) throw new Error(`${invalid.length} plantillas no pasan la validacion del frontend`);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({ version: 1, exportedAt: createdAt, gestures }, null, 2));

  console.log(`Muestras leidas: ${samples.length} | clases: ${byLabel.size}${MIRROR ? ' | espejadas en x' : ''}`);
  console.log('\nClase | Palabra | Mano | Plantillas | Firmantes | Muestras descartadas');
  for (const r of report) console.log(`${r.label} | ${r.word} | ${r.hand} | ${r.templates} | ${r.signers} | ${r.descartadas}`);
  console.log(`\n${gestures.length} plantillas -> ${OUT_PATH}`);
  console.log('Importar en la app: pantalla de entrenamiento -> importar JSON.');
};

main();
