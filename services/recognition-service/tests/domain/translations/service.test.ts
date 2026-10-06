import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidTranslationError, translationDomainService as svc } from '../../../src/translations/domain/service';
import { TRANSLATION_TYPES } from '../../../src/translations/domain/entity';

describe('translationDomainService', () => {
  const type = TRANSLATION_TYPES[0];

  test('acepta una traduccion valida', () => {
    assert.doesNotThrow(() => svc.ensureIsValid({ outputText: 'hola', type, confidence: 0.9 }));
  });

  test('rechaza outputText vacio', () => {
    assert.throws(() => svc.ensureIsValid({ outputText: '   ', type }), InvalidTranslationError);
  });

  test('rechaza type invalido', () => {
    assert.throws(() => svc.ensureIsValid({ outputText: 'hola', type: 'nope' }), InvalidTranslationError);
  });

  test('rechaza confidence fuera de 0..1', () => {
    assert.throws(() => svc.ensureIsValid({ outputText: 'hola', type, confidence: 1.5 }), InvalidTranslationError);
  });

  test('resolveInputText usa outputText si no hay input', () => {
    assert.equal(svc.resolveInputText('  ', ' hola '), 'hola');
    assert.equal(svc.resolveInputText(' a ', 'b'), 'a');
  });

  test('normalizeListParams aplica limites', () => {
    assert.deepEqual(svc.normalizeListParams({}), { limit: 50, offset: 0 });
    assert.deepEqual(svc.normalizeListParams({ limit: 999, offset: -5 }), { limit: 200, offset: 0 });
    assert.deepEqual(svc.normalizeListParams({ limit: '10', offset: '20' }), { limit: 10, offset: 20 });
  });
});
