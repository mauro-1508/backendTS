import { describe, expect, it } from 'vitest';
import { InvalidTranslationError, translationDomainService as svc } from '../../../src/domains/translations/domain/service';
import { TRANSLATION_TYPES } from '../../../src/domains/translations/domain/entity';

describe('translationDomainService', () => {
  const type = TRANSLATION_TYPES[0];

  it('acepta una traduccion valida', () => {
    expect(() => svc.ensureIsValid({ outputText: 'hola', type, confidence: 0.9 })).not.toThrow();
  });

  it('rechaza outputText vacio', () => {
    expect(() => svc.ensureIsValid({ outputText: '   ', type })).toThrow(InvalidTranslationError);
  });

  it('rechaza type invalido', () => {
    expect(() => svc.ensureIsValid({ outputText: 'hola', type: 'nope' })).toThrow(InvalidTranslationError);
  });

  it('rechaza confidence fuera de 0..1', () => {
    expect(() => svc.ensureIsValid({ outputText: 'hola', type, confidence: 1.5 })).toThrow(InvalidTranslationError);
  });

  it('resolveInputText usa outputText si no hay input', () => {
    expect(svc.resolveInputText('  ', ' hola ')).toBe('hola');
    expect(svc.resolveInputText(' a ', 'b')).toBe('a');
  });

  it('normalizeListParams aplica limites', () => {
    expect(svc.normalizeListParams({})).toEqual({ limit: 50, offset: 0 });
    expect(svc.normalizeListParams({ limit: 999, offset: -5 })).toEqual({ limit: 200, offset: 0 });
    expect(svc.normalizeListParams({ limit: '10', offset: '20' })).toEqual({ limit: 10, offset: 20 });
  });
});
