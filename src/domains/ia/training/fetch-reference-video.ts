/**
 * Baja UN video de referencia de LSC-54 sin descargar el ZIP entero.
 *
 * Los videos vienen en tres ZIP grandes (190-485 MB). Un ZIP guarda su indice
 * al final, asi que con peticiones por rango se lee ese indice y se baja solo
 * el archivo pedido (unos pocos MB).
 *
 * Sirven para saber como se hace cada sena antes de probarla frente a la
 * camara (paso 3d del plan).
 *
 * Uso:
 *   npm run ia:video -- --buscar bien           # lista los que coincidan
 *   npm run ia:video -- --buscar bien --bajar 0 # baja el primero
 *   npm run ia:video -- --zip colores --buscar rojo
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ZIPS: Record<string, string> = {
  cortesia: '76fa12dbe08e6d7e08549d80447ab1bd',
  colores: 'b07b8f10b384965b6067b0bebfad040a',
  numeros: '667b87e99c7a35f756fdfa9a031ff4a6',
};

const OUT_DIR = path.join(__dirname, 'datasets', 'lsc54', 'videos');

const args = process.argv.slice(2);
const argStr = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const ZIP = (argStr('--zip') ?? 'cortesia').toLowerCase();
const QUERY = (argStr('--buscar') ?? '').toLowerCase();
const GET = argStr('--bajar');

const urlOf = (fileId: string) => `https://china.scidb.cn/download?fileId=${fileId}`;

const range = async (fileId: string, from: number, to?: number): Promise<Buffer> => {
  const res = await fetch(urlOf(fileId), {
    headers: { Range: `bytes=${from}-${to ?? ''}`, 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(180_000),
  });
  if (res.status !== 206) throw new Error(`HTTP ${res.status} pidiendo el rango`);
  return Buffer.from(await res.arrayBuffer());
};

const sizeOf = async (fileId: string): Promise<number> => {
  const res = await fetch(urlOf(fileId), {
    headers: { Range: 'bytes=0-0', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(60_000),
  });
  const total = res.headers.get('content-range')?.split('/')[1];
  if (!total) throw new Error('El servidor no informo el tamano del ZIP');
  return Number(total);
};

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

/** Lee el indice central del ZIP (esta al final del archivo). */
const readCentralDirectory = async (fileId: string, total: number): Promise<Entry[]> => {
  // El comentario final puede medir hasta 64 KB; se leen 128 KB por si acaso.
  const tailLen = Math.min(total, 128 * 1024);
  const tail = await range(fileId, total - tailLen, total - 1);

  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('No se encontro el final del indice (ZIP64 no soportado)');
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff) throw new Error('ZIP64: indice fuera de rango');

  const cd = await range(fileId, cdOffset, cdOffset + cdSize - 1);
  const entries: Entry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    entries.push({
      method: cd.readUInt16LE(p + 10),
      compressedSize: cd.readUInt32LE(p + 20),
      size: cd.readUInt32LE(p + 24),
      localHeaderOffset: cd.readUInt32LE(p + 42),
      name: cd.subarray(p + 46, p + 46 + nameLen).toString('utf8'),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
};

const download = async (fileId: string, entry: Entry): Promise<Buffer> => {
  // La cabecera local dice cuanto ocupan nombre y extras antes de los datos.
  const header = await range(fileId, entry.localHeaderOffset, entry.localHeaderOffset + 29);
  const nameLen = header.readUInt16LE(26);
  const extraLen = header.readUInt16LE(28);
  const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen;

  const raw = await range(fileId, dataStart, dataStart + entry.compressedSize - 1);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`Metodo de compresion ${entry.method} no soportado`);
};

const main = async () => {
  const fileId = ZIPS[ZIP];
  if (!fileId) throw new Error(`--zip debe ser uno de: ${Object.keys(ZIPS).join(', ')}`);

  const total = await sizeOf(fileId);
  console.log(`ZIP "${ZIP}": ${(total / 1e6).toFixed(0)} MB. Leyendo su indice...`);
  const entries = await readCentralDirectory(fileId, total);
  const videos = entries.filter(e => !e.name.endsWith('/'));
  console.log(`${videos.length} archivos dentro.`);

  if (args.includes('--resumen')) {
    // Cuantos videos hay por sena y de cuantas personas distintas.
    const porSena = new Map<string, { videos: number; firmantes: Set<string> }>();
    for (const v of videos) {
      const parts = v.name.split('/');
      const sena = parts[parts.length - 2];
      const firmante = parts[1];
      const e = porSena.get(sena) ?? { videos: 0, firmantes: new Set<string>() };
      e.videos++;
      e.firmantes.add(firmante);
      porSena.set(sena, e);
    }
    console.log('\nsena | videos | personas');
    for (const [sena, e] of [...porSena.entries()].sort((a, b) => b[1].videos - a[1].videos)) {
      console.log(`${sena} | ${e.videos} | ${e.firmantes.size}`);
    }
    console.log(`\nTotal: ${porSena.size} senas, ${new Set(videos.map(v => v.name.split('/')[1])).size} personas`);
    return;
  }

  const hits = QUERY ? videos.filter(e => e.name.toLowerCase().includes(QUERY)) : videos;
  if (hits.length === 0) {
    console.log(`Ninguno coincide con "${QUERY}".`);
    console.log('Ejemplos:', videos.slice(0, 5).map(v => v.name).join(' | '));
    return;
  }

  if (GET === undefined) {
    console.log(`\n${hits.length} coinciden con "${QUERY}" (se baja con --bajar N):\n`);
    hits.slice(0, 20).forEach((e, i) => console.log(`  ${i}  ${e.name}  (${(e.size / 1e6).toFixed(1)} MB)`));
    return;
  }

  const entry = hits[Number(GET)];
  if (!entry) throw new Error(`No hay coincidencia numero ${GET}`);
  console.log(`Bajando ${entry.name} (${(entry.compressedSize / 1e6).toFixed(1)} MB comprimido)...`);

  const data = await download(fileId, entry);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Dentro del ZIP todos se llaman 0.avi, 1.avi...: el nombre util es la
  // carpeta (la sena) y el firmante, que es la carpeta de mas arriba.
  const parts = entry.name.split('/');
  const out = path.join(OUT_DIR, `${parts[parts.length - 2]}_firmante${parts[1]}_${path.basename(entry.name)}`);
  fs.writeFileSync(out, data);
  console.log(`Listo: ${out}`);
};

main().catch(err => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
