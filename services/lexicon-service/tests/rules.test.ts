import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCode, assertLetterMatchesType, assertSignStatus, assertSignType, buildLocalizations, normalizeCode,
  parseCategoryId, parseUiLanguage, validateCategoryName, validateChanges, validateLocalization, validateResource,
  LexiconValidationError, LexiconError, SignNotFoundError, CodeTakenError, CategoryNotFoundError, CategoryInUseError,
  CategoryNameTakenError, PositionTakenError, LetterTakenError, parseSignLanguage, parseDisplayOrder, parseAnimated,
  parsePositiveInt, parsePagination,
} from '../src/domain/rules';

const throwsValidation = (fn: () => unknown, msg: RegExp = /./) =>
  assert.throws(fn, (e: unknown) => e instanceof LexiconValidationError && msg.test((e as Error).message));

describe('assertCode / normalizeCode', () => {
  test('normaliza a mayúsculas y recorta', () => {
    assert.equal(normalizeCode('  greeting_hello '), 'GREETING_HELLO');
    assert.equal(normalizeCode(undefined), '');
  });
  test('acepta códigos válidos', () => {
    assert.equal(assertCode('letter_a'), 'LETTER_A');
    assert.equal(assertCode('NUM_10'), 'NUM_10');
    assert.equal(assertCode('A'.repeat(50)), 'A'.repeat(50));
  });
  for (const bad of ['', '   ', 'HOLA MUNDO', 'HOLA-MUNDO', 'ÑANDU', 'A.B', 'A'.repeat(51), null, undefined]) {
    test(`rechaza ${JSON.stringify(bad)}`, () => throwsValidation(() => assertCode(bad), /code inválido/));
  }
});

describe('assertSignType / assertSignStatus', () => {
  test('tipos válidos', () => { for (const t of ['LETTER', 'WORD', 'PHRASE']) assert.equal(assertSignType(t), t); });
  test('tipo inválido', () => {
    throwsValidation(() => assertSignType('SENTENCE'), /type inválido/);
    throwsValidation(() => assertSignType('word'));
    throwsValidation(() => assertSignType(undefined));
  });
  test('status válidos', () => { for (const s of ['DRAFT', 'ACTIVE', 'INACTIVE']) assert.equal(assertSignStatus(s), s); });
  test('status inválido', () => {
    throwsValidation(() => assertSignStatus('DELETED'), /status inválido/);
    throwsValidation(() => assertSignStatus(''));
  });
});

describe('assertLetterMatchesType (INV-013)', () => {
  test('LETTER con A-Z y Ñ', () => {
    for (const l of ['A', 'M', 'Z', 'Ñ']) assert.doesNotThrow(() => assertLetterMatchesType('LETTER', l));
  });
  test('LETTER sin letter o con valor inválido', () => {
    for (const l of [null, undefined, '', 'a', 'AB', '1', 'ñ', ' A']) {
      throwsValidation(() => assertLetterMatchesType('LETTER', l as string | null), /LETTER necesita/);
    }
  });
  test('WORD/PHRASE no admiten letter', () => {
    throwsValidation(() => assertLetterMatchesType('WORD', 'A'), /solo aplica/);
    throwsValidation(() => assertLetterMatchesType('PHRASE', 'B'), /solo aplica/);
  });
  test('WORD/PHRASE sin letter pasan', () => {
    assert.doesNotThrow(() => assertLetterMatchesType('WORD', null));
    assert.doesNotThrow(() => assertLetterMatchesType('PHRASE', undefined));
    assert.doesNotThrow(() => assertLetterMatchesType('WORD', ''));
  });
});

describe('parseUiLanguage', () => {
  test('por defecto ES', () => {
    for (const v of [undefined, null, '']) assert.equal(parseUiLanguage(v), 'ES');
  });
  test('acepta es/EN sin importar mayúsculas', () => {
    assert.equal(parseUiLanguage('en'), 'EN');
    assert.equal(parseUiLanguage(' es '), 'ES');
  });
  test('rechaza otros idiomas', () => {
    throwsValidation(() => parseUiLanguage('FR'), /Idioma inválido/);
    throwsValidation(() => parseUiLanguage('LSC'));
  });
});

describe('validateLocalization', () => {
  test('recorta y normaliza textos vacíos a null', () => {
    assert.deepEqual(validateLocalization({ uiLanguage: 'en', name: ' Hello ', meaning: '  ', description: ' d ' }),
      { uiLanguage: 'EN', name: 'Hello', meaning: null, description: 'd' });
  });
  test('exige nombre', () => {
    throwsValidation(() => validateLocalization({ uiLanguage: 'ES' }), /obligatorio/);
    throwsValidation(() => validateLocalization({ uiLanguage: 'ES', name: '   ' }), /obligatorio/);
  });
  test('nombre de más de 150 caracteres', () => {
    throwsValidation(() => validateLocalization({ name: 'x'.repeat(151) }), /150/);
    assert.doesNotThrow(() => validateLocalization({ name: 'x'.repeat(150) }));
  });
  test('idioma inválido', () => throwsValidation(() => validateLocalization({ uiLanguage: 'FR', name: 'x' })));
});

describe('buildLocalizations', () => {
  test('word y description son la localización ES', () => {
    assert.deepEqual(buildLocalizations({ word: 'Hola', description: 'Saludo' }),
      [{ uiLanguage: 'ES', name: 'Hola', meaning: null, description: 'Saludo' }]);
  });
  test('combina localizations con word', () => {
    const r = buildLocalizations({ localizations: [{ uiLanguage: 'EN', name: 'Hello' }], word: 'Hola' });
    assert.deepEqual(r.map(l => `${l.uiLanguage}:${l.name}`).sort(), ['EN:Hello', 'ES:Hola']);
  });
  test('word pisa el nombre ES de localizations pero conserva meaning', () => {
    const r = buildLocalizations({ localizations: [{ uiLanguage: 'ES', name: 'Viejo', meaning: 'm' }], word: 'Nuevo' });
    assert.equal(r.length, 1);
    assert.equal(r[0].name, 'Nuevo');
    assert.equal(r[0].meaning, 'm');
  });
  test('exige nombre ES', () => {
    throwsValidation(() => buildLocalizations({}), /español es obligatorio/);
    throwsValidation(() => buildLocalizations({ localizations: [{ uiLanguage: 'EN', name: 'Hello' }] }), /español es obligatorio/);
    throwsValidation(() => buildLocalizations({ word: '  ' }), /obligatorio/);
  });
  test('localizations debe ser lista', () => throwsValidation(() => buildLocalizations({ localizations: 'x' }), /lista/));
  test('cada localización necesita uiLanguage', () => {
    throwsValidation(() => buildLocalizations({ localizations: [{ name: 'Hola' }] }), /uiLanguage/);
    throwsValidation(() => buildLocalizations({ localizations: [null] }), /uiLanguage/);
  });
  test('rechaza idiomas repetidos', () => {
    throwsValidation(() => buildLocalizations({
      localizations: [{ uiLanguage: 'ES', name: 'a' }, { uiLanguage: 'es', name: 'b' }],
    }), /repetidos/);
  });
});

describe('parseCategoryId / validateCategoryName', () => {
  test('ids válidos', () => { assert.equal(parseCategoryId('3'), 3); assert.equal(parseCategoryId(7), 7); });
  test('ids inválidos', () => {
    for (const v of [0, -1, 1.5, 'abc', undefined, NaN]) throwsValidation(() => parseCategoryId(v), /categoryId/);
  });
  test('nombre de categoría', () => {
    assert.equal(validateCategoryName('  Saludos '), 'Saludos');
    throwsValidation(() => validateCategoryName('  '), /obligatorio/);
    throwsValidation(() => validateCategoryName(undefined));
    throwsValidation(() => validateCategoryName('x'.repeat(101)), /100/);
    assert.doesNotThrow(() => validateCategoryName('x'.repeat(100)));
  });
});

describe('validateChanges', () => {
  const current = { type: 'WORD' as const, letter: null };
  test('normaliza letter y language', () => {
    const r = validateChanges({ type: 'LETTER', letter: 'A' }, { letter: 'b', language: ' lsc ' });
    assert.equal(r.letter, 'B');
    assert.equal(r.language, 'LSC');
  });
  test('cambiar a LETTER exige letter', () => {
    throwsValidation(() => validateChanges(current, { type: 'LETTER' }), /LETTER necesita/);
    assert.equal(validateChanges(current, { type: 'LETTER', letter: 'ñ' }).letter, 'Ñ');
  });
  test('poner letter en un WORD falla', () => throwsValidation(() => validateChanges(current, { letter: 'A' }), /solo aplica/));
  test('pasar de LETTER a WORD sin quitar letter falla', () => {
    throwsValidation(() => validateChanges({ type: 'LETTER', letter: 'A' }, { type: 'WORD' }), /solo aplica/);
    assert.doesNotThrow(() => validateChanges({ type: 'LETTER', letter: 'A' }, { type: 'WORD', letter: null }));
  });
  test('type inválido', () => throwsValidation(() => validateChanges(current, { type: 'X' as never }), /type inválido/));
  test('sin cambios de type/letter no valida la letra', () => {
    assert.doesNotThrow(() => validateChanges({ type: 'LETTER', letter: null }, { animated: true }));
  });
});

describe('validateResource', () => {
  test('recurso válido recorta url', () => {
    assert.deepEqual(validateResource({ type: 'VIDEO', url: ' a/b.mp4 ', displayOrder: 2 }),
      { type: 'VIDEO', url: 'a/b.mp4', mimeType: null, displayOrder: 2, description: null });
  });
  test('type inválido', () => throwsValidation(() => validateResource({ type: 'PDF' as never, url: 'x' }), /type de recurso/));
  test('url vacía u omitida', () => {
    throwsValidation(() => validateResource({ type: 'IMAGE', url: '  ' }), /obligatoria/);
    throwsValidation(() => validateResource({ type: 'IMAGE' } as never), /obligatoria/);
  });
  test('url con ".." o fuera de la lista blanca', () => {
    throwsValidation(() => validateResource({ type: 'IMAGE', url: '../secret.png' }), /url inválida/);
    throwsValidation(() => validateResource({ type: 'IMAGE', url: 'a/../b.png' }), /url inválida/);
    throwsValidation(() => validateResource({ type: 'IMAGE', url: 'a%2Fb.png' }), /url inválida/);
  });
  test('longitudes: url, mimeType, description', () => {
    throwsValidation(() => validateResource({ type: 'IMAGE', url: 'a'.repeat(256) + '.png' }), /url/);
    throwsValidation(() => validateResource({ type: 'IMAGE', url: 'a.png', mimeType: 'x'.repeat(101) }), /mimeType/);
    throwsValidation(() => validateResource({ type: 'IMAGE', url: 'a.png', description: 'x'.repeat(256) }), /description/);
  });
  test('displayOrder debe ser entero >= 1', () => {
    for (const d of [0, -3, 1.5, NaN]) {
      throwsValidation(() => validateResource({ type: 'GIF', url: 'a.gif', displayOrder: d }), /displayOrder/);
    }
    assert.doesNotThrow(() => validateResource({ type: 'GIF', url: 'a.gif', displayOrder: 1 }));
    assert.doesNotThrow(() => validateResource({ type: 'GIF', url: 'a.gif' }));
  });
});

describe('errores de dominio', () => {
  const cases: [LexiconError, string, number][] = [
    [new LexiconValidationError('x'), 'VALIDATION_ERROR', 400],
    [new SignNotFoundError('A'), 'SIGN_NOT_FOUND', 404],
    [new CategoryNotFoundError(1), 'CATEGORY_NOT_FOUND', 404],
    [new CodeTakenError('A'), 'CODE_TAKEN', 409],
    [new CategoryNameTakenError('A'), 'CATEGORY_NAME_TAKEN', 409],
    [new CategoryInUseError(), 'CATEGORY_IN_USE', 409],
    [new PositionTakenError(1), 'POSITION_TAKEN', 409],
    [new PositionTakenError(), 'POSITION_TAKEN', 409],
  ];
  for (const [err, code, status] of cases) {
    test(`${err.constructor.name} -> ${code}/${status}`, () => {
      assert.ok(err instanceof Error);
      assert.equal(err.code, code);
      assert.equal(err.httpStatus, status);
    });
  }
});

describe('validaciones de entrada (400 en vez de 500)', () => {
  test('language: texto de 1 a 10 caracteres', () => {
    assert.equal(parseSignLanguage(undefined), 'LSC');
    assert.equal(parseSignLanguage(' lsc '), 'LSC');
    for (const v of [5, {}, '', 'x'.repeat(11)]) throwsValidation(() => parseSignLanguage(v), /language/);
  });
  test('displayOrder entero >= 1 y animated boolean', () => {
    for (const v of [0, 1.5, '3', null]) throwsValidation(() => parseDisplayOrder(v), /displayOrder/);
    for (const v of ['true', 1, null]) throwsValidation(() => parseAnimated(v), /animated/);
    assert.equal(parseDisplayOrder(2), 2);
    assert.equal(parseAnimated(false), false);
    throwsValidation(() => validateChanges({ type: 'WORD', letter: null }, { language: 5 as never }), /language/);
  });
  test('longitudes de localización', () => {
    throwsValidation(() => validateLocalization({ uiLanguage: 'ES', name: 'a', meaning: 'x'.repeat(256) }), /significado/);
    throwsValidation(() => validateLocalization({ uiLanguage: 'ES', name: 'a', description: 'x'.repeat(2001) }), /descripción/);
    assert.doesNotThrow(() => validateLocalization({ uiLanguage: 'ES', name: 'a', description: 'x'.repeat(2000) }));
  });
  test('ids enteros >= 1', () => {
    for (const v of ['abc', '0', '-1', '1.5', '']) throwsValidation(() => parsePositiveInt(v, 'id'), /id/);
    assert.equal(parsePositiveInt('7', 'id'), 7);
  });
  test('códigos reservados', () => {
    for (const c of ['alphabet', 'SEARCH', 'Categories', 'admin', 'media']) throwsValidation(() => assertCode(c), /reservado/);
  });
  test('paginación: defecto y tope 100, offset >= 0', () => {
    assert.deepEqual(parsePagination({}), { limit: 100, offset: 0 });
    assert.deepEqual(parsePagination({ limit: '500', offset: '20' }), { limit: 100, offset: 20 });
    assert.deepEqual(parsePagination({ limit: '10' }), { limit: 10, offset: 0 });
    throwsValidation(() => parsePagination({ limit: '0' }), /limit/);
    throwsValidation(() => parsePagination({ offset: '-1' }), /offset/);
  });
  test('LetterTakenError -> LETTER_TAKEN/409', () => {
    const e = new LetterTakenError();
    assert.equal(e.code, 'LETTER_TAKEN');
    assert.equal(e.httpStatus, 409);
  });
});
