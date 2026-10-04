import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEventBus } from '@traduce/shared';
import { makeCreateSign } from '../src/application/create_sign';
import { makeUpdateSign } from '../src/application/update_sign';
import { makePublishSign } from '../src/application/publish_sign';
import { makeDeactivateSign } from '../src/application/deactivate_sign';
import { makeListSigns } from '../src/application/list_signs';
import { makeGetSign } from '../src/application/get_sign';
import { makeGetAlphabet } from '../src/application/get_alphabet';
import { makeUpsertLocalization } from '../src/application/upsert_localization';
import { makeAddResource, makeRemoveResource } from '../src/application/manage_resources';
import {
  makeCreateCategory, makeDeleteCategory, makeListCategories, makeUpdateCategory,
} from '../src/application/manage_categories';
import { catchError, makeRepos } from './helpers/fakes';

let repos: ReturnType<typeof makeRepos>;
let saludos: { categoryId: number; name: string };
beforeEach(() => {
  repos = makeRepos();
  saludos = repos.categoryRepository.seed('Saludos');
});

const errCode = (e: any) => `${e.code}/${e.httpStatus}`;

describe('HU-LEX-006 crear seña (create_sign)', () => {
  test('siempre nace en DRAFT aunque el cuerpo diga ACTIVE, y registra created_by', async () => {
    const create = makeCreateSign(repos);
    const res = await create({
      sign: { code: 'greeting_hello', word: 'Hola', category: 'Saludos', status: 'ACTIVE' } as any,
      userId: 42,
    });
    assert.equal(res.success, true);
    assert.equal((res.data as any).status, 'DRAFT');
    assert.equal(repos.lexiconRepository.created[0].userId, 42);
    assert.equal(repos.lexiconRepository.created[0].sign.code, 'GREETING_HELLO');
    // El NewSign que recibe el repositorio no lleva status: el repositorio lo fija en DRAFT.
    assert.equal('status' in repos.lexiconRepository.created[0].sign, false);
  });

  test('aplica valores por defecto (WORD, LSC, 1000, animated=false) y acepta categoryId', async () => {
    await makeCreateSign(repos)({ sign: { code: 'X1', word: 'Equis', categoryId: saludos.categoryId }, userId: null });
    const s = repos.lexiconRepository.created[0];
    assert.deepEqual(
      { type: s.sign.type, language: s.sign.language, order: s.sign.displayOrder, animated: s.sign.animated, uid: s.userId },
      { type: 'WORD', language: 'LSC', order: 1000, animated: false, uid: null },
    );
  });

  test('CODE_TAKEN si el code ya existe (incluso INACTIVE) y no crea nada', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA', status: 'INACTIVE' });
    const e = await catchError(() => makeCreateSign(repos)({ sign: { code: 'hola', word: 'Hola', category: 'Saludos' }, userId: 1 }));
    assert.equal(errCode(e), 'CODE_TAKEN/409');
    assert.equal(repos.lexiconRepository.created.length, 0);
  });

  test('categoría inexistente (por nombre y por id) -> CATEGORY_NOT_FOUND', async () => {
    const create = makeCreateSign(repos);
    assert.equal(errCode(await catchError(() => create({ sign: { code: 'A1', word: 'a', category: 'Nada' }, userId: 1 }))), 'CATEGORY_NOT_FOUND/404');
    assert.equal(errCode(await catchError(() => create({ sign: { code: 'A1', word: 'a', categoryId: 999 }, userId: 1 }))), 'CATEGORY_NOT_FOUND/404');
  });

  test('categoría obligatoria', async () => {
    const e = await catchError(() => makeCreateSign(repos)({ sign: { code: 'A1', word: 'a' }, userId: 1 }));
    assert.equal(errCode(e), 'VALIDATION_ERROR/400');
    assert.match(e.message, /categoría es obligatoria/);
  });

  test('exige nombre en español', async () => {
    const create = makeCreateSign(repos);
    const e = await catchError(() => create({ sign: { code: 'A1', category: 'Saludos' }, userId: 1 }));
    assert.equal(errCode(e), 'VALIDATION_ERROR/400');
    const e2 = await catchError(() => create({
      sign: { code: 'A1', category: 'Saludos', localizations: [{ uiLanguage: 'EN', name: 'Hello' }] }, userId: 1,
    }));
    assert.equal(errCode(e2), 'VALIDATION_ERROR/400');
    assert.equal(repos.lexiconRepository.created.length, 0);
  });

  test('code inválido, type inválido y LETTER sin letter -> VALIDATION_ERROR', async () => {
    const create = makeCreateSign(repos);
    for (const sign of [
      { code: 'hola mundo', word: 'x', category: 'Saludos' },
      { code: 'A1', type: 'SENTENCE', word: 'x', category: 'Saludos' },
      { code: 'LETTER_A', type: 'LETTER', word: 'A', category: 'Saludos' },
      { code: 'A1', type: 'WORD', letter: 'A', word: 'x', category: 'Saludos' },
    ]) {
      assert.equal(errCode(await catchError(() => create({ sign: sign as any, userId: 1 }))), 'VALIDATION_ERROR/400');
    }
  });

  test('crea una letra válida con letter normalizada', async () => {
    await makeCreateSign(repos)({ sign: { code: 'LETTER_NN', type: 'LETTER', letter: 'ñ', word: 'Ñ', category: 'Saludos' }, userId: 1 });
    assert.equal(repos.lexiconRepository.created[0].sign.letter, 'Ñ');
  });

  test('HU-LEX-005: dos localizaciones sobre una misma seña', async () => {
    const res = await makeCreateSign(repos)({
      sign: { code: 'GREETING_HELLO', category: 'Saludos', localizations: [
        { uiLanguage: 'ES', name: 'Hola' }, { uiLanguage: 'EN', name: 'Hello' }] },
      userId: 1,
    });
    assert.equal((res.data as any).localizations.length, 2);
    assert.equal(repos.lexiconRepository.signs.length, 1);
  });
});

describe('HU-LEX-006 publicar / desactivar', () => {
  test('publicar una seña DRAFT con nombre ES la pasa a ACTIVE', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA', status: 'DRAFT' });
    const res = await makePublishSign(repos)({ code: 'hola', userId: 7 });
    assert.equal((res.data as any).status, 'ACTIVE');
    assert.deepEqual(repos.lexiconRepository.statusCalls[0], { code: 'HOLA', status: 'ACTIVE', userId: 7 });
  });

  test('publicar sin localización ES falla y no cambia el estado', async () => {
    repos.lexiconRepository.seed({
      code: 'HELLO', status: 'DRAFT', localizations: [{ uiLanguage: 'EN', name: 'Hello', meaning: null, description: null }],
    });
    const e = await catchError(() => makePublishSign(repos)({ code: 'HELLO', userId: 1 }));
    assert.equal(errCode(e), 'VALIDATION_ERROR/400');
    assert.equal(repos.lexiconRepository.signs[0].status, 'DRAFT');
    assert.equal(repos.lexiconRepository.statusCalls.length, 0);
  });

  test('publicar con nombre ES en blanco o sin localizaciones falla', async () => {
    repos.lexiconRepository.seed({ code: 'A', status: 'DRAFT', localizations: [{ uiLanguage: 'ES', name: '  ', meaning: null, description: null }] });
    repos.lexiconRepository.seed({ code: 'B', status: 'DRAFT', localizations: [] });
    repos.lexiconRepository.seed({ code: 'C', status: 'DRAFT', localizations: undefined });
    for (const code of ['A', 'B', 'C']) {
      assert.equal(errCode(await catchError(() => makePublishSign(repos)({ code, userId: 1 }))), 'VALIDATION_ERROR/400');
    }
  });

  test('publicar una INACTIVE la reactiva', async () => {
    repos.lexiconRepository.seed({ code: 'OLD', status: 'INACTIVE' });
    const res = await makePublishSign(repos)({ code: 'OLD', userId: 1 });
    assert.equal((res.data as any).status, 'ACTIVE');
  });

  test('publicar inexistente -> SIGN_NOT_FOUND', async () => {
    assert.equal(errCode(await catchError(() => makePublishSign(repos)({ code: 'NOPE', userId: 1 }))), 'SIGN_NOT_FOUND/404');
  });

  test('desactivar -> INACTIVE (no se borra)', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA' });
    const res = await makeDeactivateSign(repos)({ code: 'hola', userId: 3 });
    assert.deepEqual(res.data, { code: 'HOLA', status: 'INACTIVE' });
    assert.equal(repos.lexiconRepository.signs.length, 1);
    assert.equal(repos.lexiconRepository.signs[0].status, 'INACTIVE');
  });

  test('desactivar inexistente -> SIGN_NOT_FOUND', async () => {
    assert.equal(errCode(await catchError(() => makeDeactivateSign(repos)({ code: 'NOPE', userId: 1 }))), 'SIGN_NOT_FOUND/404');
  });
});

describe('update_sign (PATCH)', () => {
  test('ignora code y status del cuerpo', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA', status: 'DRAFT' });
    await makeUpdateSign(repos)({
      code: 'HOLA', userId: 9,
      changes: { code: 'OTRO', status: 'ACTIVE', animated: true } as any,
    });
    const call = repos.lexiconRepository.updates[0];
    assert.deepEqual(call.changes.animated, true);
    assert.equal('code' in call.changes, false);
    assert.equal('status' in call.changes, false);
    assert.equal(call.userId, 9);
    const s = repos.lexiconRepository.signs[0];
    assert.equal(s.code, 'HOLA');
    assert.equal(s.status, 'DRAFT');
  });

  test('word/description editan la localización ES conservando meaning', async () => {
    repos.lexiconRepository.seed({
      code: 'HOLA', localizations: [{ uiLanguage: 'ES', name: 'Hola', meaning: 'saludo', description: 'viejo' }],
    });
    await makeUpdateSign(repos)({ code: 'HOLA', userId: 1, changes: { word: 'Buenas' } });
    assert.deepEqual(repos.lexiconRepository.updates[0].localization,
      { uiLanguage: 'ES', name: 'Buenas', meaning: 'saludo', description: 'viejo' });
  });

  test('cambia de categoría por nombre', async () => {
    const fam = repos.categoryRepository.seed('Familia');
    repos.lexiconRepository.seed({ code: 'HOLA' });
    await makeUpdateSign(repos)({ code: 'HOLA', userId: 1, changes: { category: 'Familia' } });
    assert.equal(repos.lexiconRepository.updates[0].changes.categoryId, fam.categoryId);
  });

  test('categoría inexistente -> CATEGORY_NOT_FOUND; seña inexistente -> SIGN_NOT_FOUND', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA' });
    const update = makeUpdateSign(repos);
    assert.equal(errCode(await catchError(() => update({ code: 'HOLA', userId: 1, changes: { category: 'Nada' } }))), 'CATEGORY_NOT_FOUND/404');
    assert.equal(errCode(await catchError(() => update({ code: 'NOPE', userId: 1, changes: {} }))), 'SIGN_NOT_FOUND/404');
  });

  test('letter en WORD -> VALIDATION_ERROR y no se actualiza', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA' });
    const e = await catchError(() => makeUpdateSign(repos)({ code: 'HOLA', userId: 1, changes: { letter: 'A' } }));
    assert.equal(errCode(e), 'VALIDATION_ERROR/400');
    assert.equal(repos.lexiconRepository.updates.length, 0);
  });

  test('puede editar una seña DRAFT/INACTIVE (usa includeInactive)', async () => {
    repos.lexiconRepository.seed({ code: 'D', status: 'DRAFT' });
    const res = await makeUpdateSign(repos)({ code: 'D', userId: 1, changes: { displayOrder: 5 } });
    assert.equal((res.data as any).displayOrder, 5);
  });
});

describe('lecturas: HU-LEX-001/002/003/004', () => {
  beforeEach(() => {
    const r = repos.lexiconRepository;
    r.seed({ code: 'HOLA', word: 'Hola', status: 'ACTIVE' });
    r.seed({ code: 'HOSPITAL', word: 'Hospital', status: 'ACTIVE' });
    r.seed({ code: 'HOY', word: 'Hoy', status: 'ACTIVE' });
    r.seed({ code: 'BORRADOR', word: 'Borrador', status: 'DRAFT' });
    r.seed({ code: 'RETIRADA', word: 'Retirada', status: 'INACTIVE' });
    r.seed({ code: 'LETTER_A', word: 'A', type: 'LETTER', letter: 'A' });
    r.seed({ code: 'LETTER_B', word: 'B', type: 'LETTER', letter: 'B', status: 'DRAFT' });
  });

  test('la lista pública excluye DRAFT e INACTIVE', async () => {
    const res = await makeListSigns(repos)({});
    const codes = (res.data as any[]).map(s => s.code);
    assert.deepEqual(codes.sort(), ['HOLA', 'HOSPITAL', 'HOY', 'LETTER_A']);
  });

  test('la lista admin (includeInactive) los incluye y filtra por status', async () => {
    const all = await makeListSigns(repos)({ includeInactive: true });
    assert.equal((all.data as any[]).length, 7);
    const drafts = await makeListSigns(repos)({ includeInactive: true, status: 'draft' });
    assert.deepEqual((drafts.data as any[]).map(s => s.code).sort(), ['BORRADOR', 'LETTER_B']);
  });

  test('normaliza filtros (type/language en mayúsculas, q recortada)', async () => {
    await makeListSigns(repos)({ type: 'word', language: 'lsc', category: ' Saludos ', q: '  ho ', lang: 'en' });
    assert.deepEqual(repos.lexiconRepository.lastListFilter, {
      type: 'WORD', language: 'LSC', category: 'Saludos', q: 'ho', status: undefined, includeInactive: undefined, limit: 100, offset: 0, lang: 'EN',
    });
  });

  test('búsqueda "ho" devuelve las tres señas', async () => {
    const res = await makeListSigns(repos)({ q: 'ho' });
    assert.deepEqual((res.data as any[]).map(s => s.code).sort(), ['HOLA', 'HOSPITAL', 'HOY']);
    assert.equal(res.message, undefined);
  });

  test("búsqueda sin resultados -> mensaje \"No se encontraron señas para 'xyz'\" y data []", async () => {
    const res = await makeListSigns(repos)({ q: ' xyz ' });
    assert.equal(res.success, true);
    assert.deepEqual(res.data, []);
    assert.equal(res.message, "No se encontraron señas para 'xyz'");
  });

  test('sin q y sin resultados no hay mensaje', async () => {
    const res = await makeListSigns(repos)({ category: 'Inexistente' });
    assert.deepEqual(res.data, []);
    assert.equal(res.message, undefined);
  });

  test('lang inválido -> VALIDATION_ERROR (list, alphabet, get)', async () => {
    assert.equal(errCode(await catchError(() => makeListSigns(repos)({ lang: 'FR' }))), 'VALIDATION_ERROR/400');
    assert.equal(errCode(await catchError(() => makeGetAlphabet(repos)({ lang: 'FR' }))), 'VALIDATION_ERROR/400');
    assert.equal(errCode(await catchError(() => makeGetSign(repos)({ code: 'HOLA', lang: 'FR' }))), 'VALIDATION_ERROR/400');
  });

  test('type o status inválidos -> VALIDATION_ERROR', async () => {
    assert.equal(errCode(await catchError(() => makeListSigns(repos)({ type: 'SENTENCE' }))), 'VALIDATION_ERROR/400');
    assert.equal(errCode(await catchError(() => makeListSigns(repos)({ status: 'DELETED' }))), 'VALIDATION_ERROR/400');
  });

  test('alfabeto pide type LETTER, language LSC y solo trae ACTIVE', async () => {
    const res = await makeGetAlphabet(repos)({});
    assert.equal(repos.lexiconRepository.lastListFilter?.type, 'LETTER');
    assert.equal(repos.lexiconRepository.lastListFilter?.language, 'LSC');
    assert.equal(repos.lexiconRepository.lastListFilter?.lang, 'ES');
    assert.deepEqual((res.data as any[]).map(s => s.code), ['LETTER_A']);
  });

  test('detalle público: ACTIVE sí; DRAFT/INACTIVE -> SIGN_NOT_FOUND', async () => {
    const get = makeGetSign(repos);
    assert.equal(((await get({ code: 'hola' })).data as any).code, 'HOLA');
    assert.equal(errCode(await catchError(() => get({ code: 'BORRADOR' }))), 'SIGN_NOT_FOUND/404');
    assert.equal(errCode(await catchError(() => get({ code: 'RETIRADA' }))), 'SIGN_NOT_FOUND/404');
  });

  test('detalle admin (includeInactive) ve DRAFT e INACTIVE', async () => {
    const get = makeGetSign(repos);
    assert.equal(((await get({ code: 'BORRADOR', includeInactive: true })).data as any).status, 'DRAFT');
    assert.equal(((await get({ code: 'RETIRADA', includeInactive: true })).data as any).status, 'INACTIVE');
  });

  test('detalle: sin recursos devuelve la seña con resources []', async () => {
    const s = (await makeGetSign(repos)({ code: 'HOLA' })).data as any;
    assert.deepEqual(s.resources, []);
  });

  test('detalle: se localiza por code, no por nombre', async () => {
    // 'Hola ' se normaliza a HOLA y existe.
    assert.equal(((await makeGetSign(repos)({ code: 'Hola ' })).data as any).code, 'HOLA');
  });

  test('detalle pasa el idioma pedido al repositorio', async () => {
    await makeGetSign(repos)({ code: 'HOLA', lang: 'en' });
    assert.equal(repos.lexiconRepository.lastFindOptions?.lang, 'EN');
  });
});

describe('upsert_localization', () => {
  test('crea/reemplaza localización EN', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA' });
    const res = await makeUpsertLocalization(repos)({ code: 'hola', uiLanguage: 'en', localization: { name: ' Hello ', meaning: 'greeting' } });
    assert.deepEqual(res.data, { uiLanguage: 'EN', name: 'Hello', meaning: 'greeting', description: null });
    assert.ok(repos.lexiconRepository.signs[0].localizations!.some(l => l.uiLanguage === 'EN'));
  });
  test('idioma inválido, sin nombre, y seña inexistente', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA' });
    const up = makeUpsertLocalization(repos);
    assert.equal(errCode(await catchError(() => up({ code: 'HOLA', uiLanguage: 'FR', localization: { name: 'x' } }))), 'VALIDATION_ERROR/400');
    assert.equal(errCode(await catchError(() => up({ code: 'HOLA', uiLanguage: 'EN', localization: {} }))), 'VALIDATION_ERROR/400');
    assert.equal(errCode(await catchError(() => up({ code: 'NOPE', uiLanguage: 'EN', localization: { name: 'x' } }))), 'SIGN_NOT_FOUND/404');
  });
});

describe('HU-LEX-007 recursos multimedia', () => {
  beforeEach(() => { repos.lexiconRepository.seed({ code: 'HOLA' }); });

  test('agrega video en posición 1 y animación en posición 2, en orden', async () => {
    const add = makeAddResource(repos);
    await add({ code: 'HOLA', resource: { type: 'VIDEO', url: 'hola/video.mp4', displayOrder: 1 } });
    await add({ code: 'hola', resource: { type: 'GIF', url: 'hola/anim.gif', displayOrder: 2 } });
    assert.deepEqual(repos.lexiconRepository.signs[0].resources.map(r => [r.type, r.displayOrder]), [['VIDEO', 1], ['GIF', 2]]);
  });

  test('segunda resource en la misma posición -> POSITION_TAKEN', async () => {
    const add = makeAddResource(repos);
    await add({ code: 'HOLA', resource: { type: 'VIDEO', url: 'a.mp4', displayOrder: 1 } });
    const e = await catchError(() => add({ code: 'HOLA', resource: { type: 'IMAGE', url: 'b.png', displayOrder: 1 } }));
    assert.equal(errCode(e), 'POSITION_TAKEN/409');
    assert.equal(repos.lexiconRepository.signs[0].resources.length, 1);
  });

  test('sin displayOrder no consulta posición', async () => {
    const add = makeAddResource(repos);
    await add({ code: 'HOLA', resource: { type: 'VIDEO', url: 'a.mp4' } });
    await add({ code: 'HOLA', resource: { type: 'IMAGE', url: 'b.png' } });
    assert.equal(repos.lexiconRepository.signs[0].resources.length, 2);
  });

  test('url fuera de la lista blanca -> VALIDATION_ERROR; https solo del origen configurado', async () => {
    const add = makeAddResource({ ...repos, mediaBaseUrl: 'https://cdn.example.com/lex' });
    for (const url of ['javascript:alert(1)', 'http://cdn.example.com/a.png', 'https://evil.com/a.png', 'a%2Fb.png', 'a\b.png', 'a.exe']) {
      assert.equal(errCode(await catchError(() => add({ code: 'HOLA', resource: { type: 'IMAGE', url } }))), 'VALIDATION_ERROR/400', url);
    }
    await add({ code: 'HOLA', resource: { type: 'IMAGE', url: 'https://cdn.example.com/x/a.png' } });
    // sin LEXICON_MEDIA_BASE_URL no se aceptan absolutas
    assert.equal(errCode(await catchError(() => makeAddResource(repos)({ code: 'HOLA', resource: { type: 'IMAGE', url: 'https://cdn.example.com/a.png' } }))), 'VALIDATION_ERROR/400');
  });

  test('quitar con resourceId inválido -> VALIDATION_ERROR', async () => {
    for (const id of [0, -1, 1.5, NaN]) {
      assert.equal(errCode(await catchError(() => makeRemoveResource(repos)({ code: 'HOLA', resourceId: id }))), 'VALIDATION_ERROR/400');
    }
  });

  test('url con ".." o tipo inválido -> VALIDATION_ERROR', async () => {
    const add = makeAddResource(repos);
    assert.equal(errCode(await catchError(() => add({ code: 'HOLA', resource: { type: 'IMAGE', url: '../x.png' } }))), 'VALIDATION_ERROR/400');
    assert.equal(errCode(await catchError(() => add({ code: 'HOLA', resource: { type: 'PDF' as any, url: 'x' } }))), 'VALIDATION_ERROR/400');
  });

  test('seña inexistente -> SIGN_NOT_FOUND (también al quitar)', async () => {
    assert.equal(errCode(await catchError(() => makeAddResource(repos)({ code: 'NOPE', resource: { type: 'IMAGE', url: 'x.png' } }))), 'SIGN_NOT_FOUND/404');
    assert.equal(errCode(await catchError(() => makeRemoveResource(repos)({ code: 'NOPE', resourceId: 1 }))), 'SIGN_NOT_FOUND/404');
  });

  test('agrega a una seña DRAFT', async () => {
    repos.lexiconRepository.seed({ code: 'D', status: 'DRAFT' });
    const res = await makeAddResource(repos)({ code: 'D', resource: { type: 'IMAGE', url: 'd.png' } });
    assert.equal(res.success, true);
  });

  test('quitar un recurso existente', async () => {
    const r = (await makeAddResource(repos)({ code: 'HOLA', resource: { type: 'IMAGE', url: 'x.png' } })).data as any;
    const res = await makeRemoveResource(repos)({ code: 'HOLA', resourceId: r.resourceId });
    assert.deepEqual(res.data, { resourceId: r.resourceId });
    assert.equal(repos.lexiconRepository.signs[0].resources.length, 0);
  });
});

describe('categorías (HU-LEX-001/006)', () => {
  test('lista con signCount', async () => {
    repos.categoryRepository.signCounts.set(saludos.categoryId, 12);
    const res = await makeListCategories(repos)();
    assert.deepEqual(res.data, [{ categoryId: saludos.categoryId, name: 'Saludos', description: null, signCount: 12 }]);
  });

  test('crear: recorta nombre y descripción vacía -> null', async () => {
    const res = await makeCreateCategory(repos)({ name: '  Familia ', description: '   ' });
    assert.equal((res.data as any).name, 'Familia');
    assert.equal((res.data as any).description, null);
  });

  test('crear: nombre vacío -> VALIDATION_ERROR; repetido (sin importar mayúsculas) -> CATEGORY_NAME_TAKEN', async () => {
    const create = makeCreateCategory(repos);
    assert.equal(errCode(await catchError(() => create({ name: '' }))), 'VALIDATION_ERROR/400');
    assert.equal(errCode(await catchError(() => create({ name: 'saludos' }))), 'CATEGORY_NAME_TAKEN/409');
    assert.equal(repos.categoryRepository.categories.length, 1);
  });

  test('actualizar: nombre propio no choca consigo misma; el de otra sí', async () => {
    const fam = repos.categoryRepository.seed('Familia');
    const update = makeUpdateCategory(repos);
    const ok = await update({ categoryId: fam.categoryId, changes: { name: 'Familia', description: 'x' } });
    assert.equal((ok.data as any).description, 'x');
    assert.equal(errCode(await catchError(() => update({ categoryId: fam.categoryId, changes: { name: 'Saludos' } }))), 'CATEGORY_NAME_TAKEN/409');
  });

  test('actualizar: sin cambios, id inválido, inexistente', async () => {
    const update = makeUpdateCategory(repos);
    assert.equal(errCode(await catchError(() => update({ categoryId: saludos.categoryId, changes: {} }))), 'VALIDATION_ERROR/400');
    assert.equal(errCode(await catchError(() => update({ categoryId: 'abc', changes: { name: 'x' } }))), 'VALIDATION_ERROR/400');
    assert.equal(errCode(await catchError(() => update({ categoryId: 99, changes: { name: 'x' } }))), 'CATEGORY_NOT_FOUND/404');
  });

  test('eliminar categoría con señas -> CATEGORY_IN_USE y no se borra', async () => {
    repos.categoryRepository.signCounts.set(saludos.categoryId, 12);
    const e = await catchError(() => makeDeleteCategory(repos)({ categoryId: saludos.categoryId }));
    assert.equal(errCode(e), 'CATEGORY_IN_USE/409');
    assert.deepEqual(repos.categoryRepository.deleted, []);
    assert.equal(repos.categoryRepository.categories.length, 1);
  });

  test('eliminar categoría vacía funciona; inexistente -> CATEGORY_NOT_FOUND', async () => {
    const del = makeDeleteCategory(repos);
    const res = await del({ categoryId: String(saludos.categoryId) });
    assert.deepEqual(res.data, { categoryId: saludos.categoryId });
    assert.equal(repos.categoryRepository.categories.length, 0);
    assert.equal(errCode(await catchError(() => del({ categoryId: saludos.categoryId }))), 'CATEGORY_NOT_FOUND/404');
  });
});

describe('eventos de lexicon', () => {
  let silenced: typeof console.error;
  beforeEach(() => { silenced = console.error; console.error = () => {}; });
  afterEach(() => { console.error = silenced; });

  test('publicar emite lexicon.SignPublished con los datos de la seña', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA', status: 'DRAFT' });
    await makePublishSign(repos)({ code: 'hola', userId: 7 });
    assert.equal(repos.eventPublisher.published.length, 1);
    const [event] = repos.eventPublisher.published;
    assert.equal(event.type, 'lexicon.SignPublished');
    assert.equal((event.payload as any).code, 'HOLA');
    assert.deepEqual(Object.keys(event.payload as object).sort(),
      ['categoryId', 'code', 'language', 'letter', 'lexiconId', 'type']);
  });

  test('publicar que falla (sin nombre ES) no emite evento', async () => {
    repos.lexiconRepository.seed({ code: 'HELLO', status: 'DRAFT', localizations: [] });
    await catchError(() => makePublishSign(repos)({ code: 'HELLO', userId: 1 }));
    assert.equal(repos.eventPublisher.published.length, 0);
  });

  test('retirar emite lexicon.SignWithdrawn', async () => {
    repos.lexiconRepository.seed({ code: 'HOLA' });
    await makeDeactivateSign(repos)({ code: 'hola', userId: 3 });
    assert.equal(repos.eventPublisher.published.length, 1);
    assert.equal(repos.eventPublisher.published[0].type, 'lexicon.SignWithdrawn');
    assert.equal((repos.eventPublisher.published[0].payload as any).code, 'HOLA');
  });

  test('retirar inexistente no emite evento', async () => {
    await catchError(() => makeDeactivateSign(repos)({ code: 'NOPE', userId: 1 }));
    assert.equal(repos.eventPublisher.published.length, 0);
  });

  test('si el broker falla, publicar y retirar siguen funcionando', async () => {
    repos.eventPublisher.failWith = new Error('rabbit caido');
    repos.lexiconRepository.seed({ code: 'HOLA', status: 'DRAFT' });
    const published = await makePublishSign(repos)({ code: 'hola', userId: 1 });
    assert.equal((published.data as any).status, 'ACTIVE');
    const withdrawn = await makeDeactivateSign(repos)({ code: 'hola', userId: 1 });
    assert.deepEqual(withdrawn.data, { code: 'HOLA', status: 'INACTIVE' });
  });

  test('con InMemoryEventBus un suscriptor recibe el evento de publicación', async () => {
    const bus = new InMemoryEventBus();
    const received: string[] = [];
    await bus.subscribe({ queue: 'recognition.lexicon', pattern: 'lexicon.*' }, async e => { received.push(e.type); });
    repos.lexiconRepository.seed({ code: 'HOLA', status: 'DRAFT' });
    await makePublishSign({ ...repos, eventPublisher: bus })({ code: 'hola', userId: 1 });
    assert.deepEqual(received, ['lexicon.SignPublished']);
  });
});
