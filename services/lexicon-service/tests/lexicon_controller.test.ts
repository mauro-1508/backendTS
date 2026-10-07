import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
// Carga la augmentacion global de Express (req.user) declarada en @traduce/shared.
import '@traduce/shared';
import { makeLexiconController } from '../src/adapters/inbound/http/lexicon_controller';
import { LexiconResult, LexiconService } from '../src/ports/inbound/lexicon_service';
import {
  CategoryInUseError, CategoryNameTakenError, CategoryNotFoundError, CodeTakenError, LexiconValidationError,
  PositionTakenError, SignNotFoundError,
} from '../src/domain/rules';

/** Servicio falso: cada método registra la llamada y devuelve `next` (o lanza si es un Error). */
const makeService = () => {
  const calls: { method: string; input: any }[] = [];
  let next: LexiconResult | Error = { success: true, data: [] };
  const service = new Proxy({}, {
    get: (_t, method: string) => async (input?: unknown) => {
      calls.push({ method, input });
      if (next instanceof Error) throw next;
      return next;
    },
  }) as LexiconService;
  return { service, calls, setNext: (n: LexiconResult | Error) => { next = n; } };
};

const makeReq = (over: Record<string, unknown> = {}) => ({
  query: {}, params: {}, body: undefined, user: undefined, protocol: 'http', baseUrl: '/api/lexicon',
  get: (h: string) => (h.toLowerCase() === 'host' ? 'localhost:3000' : undefined),
  ...over,
}) as any;

const makeRes = () => {
  const res: any = { statusCode: undefined, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
};

let silenced: typeof console.error;
beforeEach(() => { silenced = console.error; console.error = () => {}; });
afterEach(() => { console.error = silenced; });

describe('mapeo de errores de dominio a status + code', () => {
  const cases: [string, Error, number, string][] = [
    ['validación', new LexiconValidationError('mal'), 400, 'VALIDATION_ERROR'],
    ['seña no encontrada', new SignNotFoundError('X'), 404, 'SIGN_NOT_FOUND'],
    ['categoría no encontrada', new CategoryNotFoundError(3), 404, 'CATEGORY_NOT_FOUND'],
    ['code ocupado', new CodeTakenError('X'), 409, 'CODE_TAKEN'],
    ['nombre de categoría ocupado', new CategoryNameTakenError('X'), 409, 'CATEGORY_NAME_TAKEN'],
    ['categoría en uso', new CategoryInUseError(), 409, 'CATEGORY_IN_USE'],
    ['posición ocupada', new PositionTakenError(1), 409, 'POSITION_TAKEN'],
  ];
  for (const [name, error, status, code] of cases) {
    test(`${name} -> ${status} ${code}`, async () => {
      const { service, setNext } = makeService();
      setNext(error);
      const res = makeRes();
      await makeLexiconController(service).get(makeReq({ params: { code: 'X' } }), res);
      assert.equal(res.statusCode, status);
      assert.deepEqual(res.body, { success: false, code, message: error.message });
    });
  }

  test('error de check de Postgres (23514) -> 400 VALIDATION_ERROR', async () => {
    const { service, setNext } = makeService();
    setNext(Object.assign(new Error('check violado'), { code: '23514' }));
    const res = makeRes();
    await makeLexiconController(service).get(makeReq({ params: { code: 'X' } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  test('error desconocido -> 500 sin filtrar el mensaje interno', async () => {
    const { service, setNext } = makeService();
    setNext(new Error('password=secreto'));
    const res = makeRes();
    await makeLexiconController(service).list(makeReq(), res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(res.body), /secreto/);
  });

  test('todas las rutas atrapan errores (ninguna lanza)', async () => {
    const { service, setNext } = makeService();
    setNext(new SignNotFoundError('X'));
    const controller = makeLexiconController(service) as Record<string, (req: any, res: any) => Promise<void>>;
    for (const name of Object.keys(controller)) {
      const res = makeRes();
      await controller[name](makeReq({ params: { code: 'X', lang: 'ES', id: '1', resourceId: '1' }, query: { q: 'x' } }), res);
      assert.ok(res.statusCode >= 400, `${name} no respondió con error`);
    }
  });
});

describe('conversión de URLs relativas a absolutas', () => {
  const sign = (urls: string[]) => ({
    code: 'A', resources: urls.map((url, i) => ({ resourceId: i + 1, type: 'MODEL_3D', url, mimeType: null, displayOrder: i + 1, description: null })),
  });

  test('detalle: rutas relativas -> http://host/api/lexicon/media/...', async () => {
    const { service, setNext } = makeService();
    setNext({ success: true, data: sign(['alfabeto/glb/A.glb', '/alfabeto/thumbs/A.png']) });
    const res = makeRes();
    await makeLexiconController(service).get(makeReq({ params: { code: 'A' } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data.resources.map((r: any) => r.url), [
      'http://localhost:3000/api/lexicon/media/alfabeto/glb/A.glb',
      'http://localhost:3000/api/lexicon/media/alfabeto/thumbs/A.png',
    ]);
  });

  test('solo las URL https no se tocan (otros esquemas se tratan como ruta)', async () => {
    const { service, setNext } = makeService();
    setNext({ success: true, data: sign(['https://cdn.example.com/a.glb', 'javascript://%0Aalert(1)']) });
    const res = makeRes();
    await makeLexiconController(service).get(makeReq({ params: { code: 'A' } }), res);
    assert.deepEqual(res.body.data.resources.map((r: any) => r.url), [
      'https://cdn.example.com/a.glb',
      'http://localhost:3000/api/lexicon/media/javascript://%0Aalert(1)',
    ]);
  });

  test('listas: convierte los recursos de cada seña y deja intactos los demás elementos', async () => {
    const { service, setNext } = makeService();
    setNext({ success: true, data: [sign(['a.glb']), sign([]), { categoryId: 1, name: 'Saludos' }] });
    const res = makeRes();
    await makeLexiconController(service).list(makeReq(), res);
    assert.equal(res.body.data[0].resources[0].url, 'http://localhost:3000/api/lexicon/media/a.glb');
    assert.deepEqual(res.body.data[1].resources, []);
    assert.deepEqual(res.body.data[2], { categoryId: 1, name: 'Saludos' });
  });

  test('un recurso suelto (addResource) también se convierte', async () => {
    const { service, setNext } = makeService();
    setNext({ success: true, message: 'Recurso agregado', data: { resourceId: 9, type: 'IMAGE', url: 'x/y.png' } });
    const res = makeRes();
    await makeLexiconController(service).addResource(makeReq({ params: { code: 'A' }, body: { type: 'IMAGE', url: 'x/y.png' } }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.url, 'http://localhost:3000/api/lexicon/media/x/y.png');
  });

  test('mediaBaseUrl (CDN) tiene prioridad y se recorta la barra final', async () => {
    const { service, setNext } = makeService();
    setNext({ success: true, data: sign(['alfabeto/glb/A.glb']) });
    const res = makeRes();
    await makeLexiconController(service, { mediaBaseUrl: 'https://cdn.example.com/lex/' }).get(makeReq({ params: { code: 'A' } }), res);
    assert.equal(res.body.data.resources[0].url, 'https://cdn.example.com/lex/alfabeto/glb/A.glb');
  });

  test('datos sin recursos (null, listas de categorías) pasan sin cambios', async () => {
    const { service, setNext } = makeService();
    setNext({ success: true, data: [{ categoryId: 1, name: 'x', signCount: 2 }] });
    const res = makeRes();
    await makeLexiconController(service).listCategories(makeReq(), res);
    assert.deepEqual(res.body.data, [{ categoryId: 1, name: 'x', signCount: 2 }]);
  });

  test('preserva success y message del servicio', async () => {
    const { service, setNext } = makeService();
    setNext({ success: true, message: "No se encontraron señas para 'xyz'", data: [] });
    const res = makeRes();
    await makeLexiconController(service).list(makeReq({ query: { q: 'xyz' } }), res);
    assert.deepEqual(res.body, { success: true, message: "No se encontraron señas para 'xyz'", data: [] });
  });
});

describe('entrada HTTP -> servicio', () => {
  test('create: elimina status del cuerpo, pasa userId y responde 201', async () => {
    const { service, calls } = makeService();
    const res = makeRes();
    await makeLexiconController(service).create(
      makeReq({ body: { code: 'HOLA', word: 'Hola', status: 'ACTIVE' }, user: { userId: 11, email: 'a@b.c' } }), res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(calls[0].input, { sign: { code: 'HOLA', word: 'Hola' }, userId: 11 });
  });

  test('create sin usuario -> userId null; sin cuerpo no revienta', async () => {
    const { service, calls } = makeService();
    await makeLexiconController(service).create(makeReq({ body: undefined }), makeRes());
    assert.deepEqual(calls[0].input, { sign: {}, userId: null });
  });

  test('update: elimina code y status del cuerpo', async () => {
    const { service, calls } = makeService();
    await makeLexiconController(service).update(
      makeReq({ params: { code: 'HOLA' }, body: { code: 'OTRO', status: 'ACTIVE', word: 'Hola2' }, user: { userId: 2, email: '' } }),
      makeRes());
    assert.deepEqual(calls[0].input, { code: 'HOLA', changes: { word: 'Hola2' }, userId: 2 });
  });

  test('list pública no pide includeInactive; adminList sí', async () => {
    const { service, calls } = makeService();
    const c = makeLexiconController(service);
    await c.list(makeReq({ query: { q: 'ho', lang: 'EN', type: 'WORD' } }), makeRes());
    await c.adminList(makeReq({ query: { status: 'DRAFT' } }), makeRes());
    assert.equal(calls[0].input.includeInactive, undefined);
    assert.deepEqual({ q: calls[0].input.q, lang: calls[0].input.lang, type: calls[0].input.type }, { q: 'ho', lang: 'EN', type: 'WORD' });
    assert.equal(calls[1].input.includeInactive, true);
    assert.equal(calls[1].input.status, 'DRAFT');
  });

  test('adminGet pide includeInactive; get público no', async () => {
    const { service, calls } = makeService();
    const c = makeLexiconController(service);
    await c.adminGet(makeReq({ params: { code: 'X' } }), makeRes());
    await c.get(makeReq({ params: { code: 'X' } }), makeRes());
    assert.equal(calls[0].input.includeInactive, true);
    assert.equal(calls[1].input.includeInactive, undefined);
  });

  test('search sin q -> 400 VALIDATION_ERROR sin llamar al servicio', async () => {
    const { service, calls } = makeService();
    const res = makeRes();
    await makeLexiconController(service).search(makeReq({ query: { q: '   ' } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.equal(calls.length, 0);
  });

  test('search con q llama a list', async () => {
    const { service, calls } = makeService();
    await makeLexiconController(service).search(makeReq({ query: { q: 'ho' } }), makeRes());
    assert.equal(calls[0].method, 'list');
    assert.equal(calls[0].input.q, 'ho');
  });

  test('publish / deactivate / removeResource / categorías: parámetros y status', async () => {
    const { service, calls } = makeService();
    const c = makeLexiconController(service);
    const user = { userId: 4, email: '' };
    const r1 = makeRes(); await c.publish(makeReq({ params: { code: 'A' }, user }), r1);
    const r2 = makeRes(); await c.deactivate(makeReq({ params: { code: 'A' }, user }), r2);
    const r3 = makeRes(); await c.removeResource(makeReq({ params: { code: 'A', resourceId: '7' } }), r3);
    const r4 = makeRes(); await c.createCategory(makeReq({ body: { name: 'N' } }), r4);
    const r5 = makeRes(); await c.deleteCategory(makeReq({ params: { id: '3' } }), r5);
    const r6 = makeRes(); await c.upsertLocalization(makeReq({ params: { code: 'A', lang: 'EN' }, body: { name: 'Hi' } }), r6);
    assert.deepEqual([r1, r2, r3, r4, r5, r6].map(r => r.statusCode), [200, 200, 200, 201, 200, 200]);
    assert.deepEqual(calls[0].input, { code: 'A', userId: 4 });
    assert.deepEqual(calls[2].input, { code: 'A', resourceId: 7 });
    assert.deepEqual(calls[4].input, { categoryId: '3' });
    assert.deepEqual(calls[5].input, { code: 'A', uiLanguage: 'EN', localization: { name: 'Hi' } });
  });
});
