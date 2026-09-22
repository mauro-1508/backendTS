/**
 * Mide que senas de LSC-54 distingue el motor de plantillas de la app, antes
 * de elegir las 20 palabras.
 *
 * Usa exactamente el mismo pipeline que la app (domain/motion_template.ts):
 * normalize.ts + remuestreo a 16 + DTW con banda 4 + umbrales de confianza.
 *
 * Protocolo:
 *   - Plantillas: hasta TEMPLATES_PER_SIGN muestras por sena, repartidas entre
 *     firmantes (como las que se importarian en la app).
 *   - Consultas: todas las muestras. Para cada una se ignoran las plantillas
 *     del MISMO firmante: simula a una persona nueva frente a la camara.
 *   - Acierto: la plantilla mas cercana es de la misma sena y la app la
 *     aceptaria (confianza >= 0.7 y distancia <= MAX_GESTURE_DISTANCE).
 *   - Falsa palabra: la app aceptaria una sena equivocada.
 *   - Seleccion: se elimina de a una la sena con menos aciertos hasta dejar 20.
 *
 * Simplificacion conocida: la consulta usa el tramo activo completo de la
 * muestra; en vivo la app mira una ventana de 2,2 s muestreada cada 120 ms.
 *
 * Uso: npm run ia:measure-lsc54 [-- --min-samples 10 --target 20]
 */
import fs from 'fs';
import path from 'path';
import { dtwDistance, gestureConfidence, MAX_GESTURE_DISTANCE, MIN_WORD_CONFIDENCE } from '../domain/motion_template';
import { loadRep0Samples, pickHand, toTemplateFrames } from './lsc54-rep0';

const args = process.argv.slice(2);
const argNum = (name: string, def: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const MIN_SAMPLES = argNum('--min-samples', 10);
const TARGET = argNum('--target', 20);
const TEMPLATES_PER_SIGN = argNum('--templates', 15);

const OUT_MD = path.join(__dirname, 'output', 'lsc54-separability.md');
const OUT_JSON = path.join(__dirname, 'output', 'lsc54-separability.json');

interface Prepared {
  idx: number;
  label: string;
  signer: string;
  seq: number[][];
}

const labelOf = (sign: string) => sign.trim().toLowerCase();

const main = () => {
  const t0 = Date.now();
  const raw = loadRep0Samples();
  const prepared: Prepared[] = [];
  let tooShort = 0;
  for (const s of raw) {
    const seq = toTemplateFrames(s.frames, pickHand(s.frames));
    if (!seq) {
      tooShort++;
      continue;
    }
    prepared.push({ idx: prepared.length, label: labelOf(s.sign), signer: s.signer, seq });
  }

  // Senas con suficientes muestras y al menos 3 firmantes.
  const bySign = new Map<string, Prepared[]>();
  for (const p of prepared) bySign.set(p.label, [...(bySign.get(p.label) ?? []), p]);
  const eligible = [...bySign.entries()]
    .filter(([, ps]) => ps.length >= MIN_SAMPLES && new Set(ps.map(p => p.signer)).size >= 3)
    .map(([label]) => label)
    .sort();
  const skipped = [...bySign.keys()].filter(l => !eligible.includes(l)).sort();

  console.log(
    `Muestras rep_0: ${raw.length} (sin mano suficiente: ${tooShort}) | senas: ${bySign.size} | elegibles: ${eligible.length}`,
  );
  if (eligible.length < 2) {
    console.log('Aun no hay datos suficientes para medir.');
    return;
  }

  // Plantillas: round-robin por firmante para repartir personas.
  const templates: Prepared[] = [];
  for (const label of eligible) {
    const bySigner = new Map<string, Prepared[]>();
    for (const p of bySign.get(label)!) bySigner.set(p.signer, [...(bySigner.get(p.signer) ?? []), p]);
    const queues = [...bySigner.keys()].sort().map(k => bySigner.get(k)!);
    const chosen: Prepared[] = [];
    for (let round = 0; chosen.length < TEMPLATES_PER_SIGN && queues.some(q => q.length > round); round++) {
      for (const q of queues) if (q[round] && chosen.length < TEMPLATES_PER_SIGN) chosen.push(q[round]);
    }
    templates.push(...chosen);
  }

  const queries = prepared.filter(p => eligible.includes(p.label));
  console.log(`Calculando ${queries.length} x ${templates.length} distancias DTW...`);
  const dist = queries.map(q =>
    Float32Array.from(templates, t => (t.signer === q.signer ? Infinity : dtwDistance(q.seq, t.seq))),
  );
  console.log(`Distancias listas en ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  const accepted = (d: number) => d <= MAX_GESTURE_DISTANCE && gestureConfidence(d) >= MIN_WORD_CONFIDENCE;

  const evaluate = (signs: Set<string>) => {
    const per = new Map<string, { n: number; top1: number; ok: number; falseWord: number; confused: Map<string, number> }>();
    for (const s of signs) per.set(s, { n: 0, top1: 0, ok: 0, falseWord: 0, confused: new Map() });
    queries.forEach((q, qi) => {
      if (!signs.has(q.label)) return;
      let best = Infinity;
      let bestLabel = '';
      templates.forEach((t, ti) => {
        if (!signs.has(t.label)) return;
        const d = dist[qi][ti];
        if (d < best) {
          best = d;
          bestLabel = t.label;
        }
      });
      const r = per.get(q.label)!;
      r.n++;
      if (bestLabel === q.label) {
        r.top1++;
        if (accepted(best)) r.ok++;
      } else {
        r.confused.set(bestLabel, (r.confused.get(bestLabel) ?? 0) + 1);
        if (accepted(best)) r.falseWord++;
      }
    });
    return per;
  };

  // Eliminacion hacia atras: fuera la sena con menor tasa de acierto.
  const active = new Set(eligible);
  const removed: { label: string; ok: number }[] = [];
  while (active.size > Math.min(TARGET, eligible.length)) {
    const per = evaluate(active);
    let worst = '';
    let worstRate = Infinity;
    for (const [label, r] of per) {
      const rate = r.ok / r.n;
      if (rate < worstRate) {
        worstRate = rate;
        worst = label;
      }
    }
    active.delete(worst);
    removed.push({ label: worst, ok: worstRate });
  }

  const final = evaluate(active);
  const all = evaluate(new Set(eligible));
  const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, b))} %`;
  const rows = [...final.entries()].sort(([, a], [, b]) => b.ok / b.n - a.ok / a.n);
  const totals = [...final.values()].reduce(
    (s, r) => ({ n: s.n + r.n, ok: s.ok + r.ok, falseWord: s.falseWord + r.falseWord }),
    { n: 0, ok: 0, falseWord: 0 },
  );

  const signersOf = (label: string) => new Set(bySign.get(label)!.map(p => p.signer)).size;
  const topConfusions = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([l, c]) => `${l} (${c})`)
      .join(', ');

  const md = [
    '# LSC-54 — separabilidad con el motor de plantillas',
    '',
    `Generado ${new Date().toISOString()} por \`measure-lsc54-separability.ts\`.`,
    '',
    `- Muestras rep_0 leidas: ${raw.length}; con mano suficiente: ${prepared.length}`,
    `- Senas con datos: ${bySign.size}; elegibles (>= ${MIN_SAMPLES} muestras y >= 3 firmantes): ${eligible.length}`,
    `- Plantillas: hasta ${TEMPLATES_PER_SIGN} por sena; consultas contra plantillas de OTROS firmantes`,
    `- Acierto = sena correcta y aceptada por la app (confianza >= ${MIN_WORD_CONFIDENCE}, DTW <= ${MAX_GESTURE_DISTANCE})`,
    '',
    `## Las ${active.size} mas distinguibles`,
    '',
    `Total: acierto ${pct(totals.ok, totals.n)}, falsa palabra ${pct(totals.falseWord, totals.n)} (${totals.n} consultas)`,
    '',
    '| Sena (clase del dataset) | Muestras | Firmantes | Acierto | Top-1 | Falsa palabra | Se confunde con |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(
      ([label, r]) =>
        `| ${label} | ${r.n} | ${signersOf(label)} | ${pct(r.ok, r.n)} | ${pct(r.top1, r.n)} | ${pct(r.falseWord, r.n)} | ${topConfusions(r.confused)} |`,
    ),
    '',
    '## Eliminadas (en orden, con su acierto al salir)',
    '',
    ...removed.map(r => `- ${r.label}: ${pct(r.ok, 1)}`),
    '',
    '## Todas las elegibles juntas',
    '',
    '| Sena | Acierto | Top-1 | Se confunde con |',
    '|---|---|---|---|',
    ...[...all.entries()]
      .sort(([, a], [, b]) => b.ok / b.n - a.ok / a.n)
      .map(([label, r]) => `| ${label} | ${pct(r.ok, r.n)} | ${pct(r.top1, r.n)} | ${topConfusions(r.confused)} |`),
    '',
    skipped.length ? `Sin datos suficientes todavia: ${skipped.join(', ')}` : '',
  ].join('\n');

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        selected: rows.map(([label, r]) => ({ label, n: r.n, ok: r.ok, top1: r.top1, falseWord: r.falseWord })),
        removed,
        templatesPerSign: TEMPLATES_PER_SIGN,
      },
      null,
      2,
    ),
  );
  console.log(md);
  console.log(`\nGuardado en ${OUT_MD}`);
};

main();
