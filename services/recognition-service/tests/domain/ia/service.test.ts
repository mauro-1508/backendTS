import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidSignTemplateError, signTemplateDomainService as svc } from '../../../src/ia/domain/service';
import { WORD_DIM, WORD_SEQ_LEN } from '../../../src/common/domain/landmarks';

const frames = (n: number, dim: number) => Array.from({ length: n }, () => new Array(dim).fill(0.1));

describe('signTemplateDomainService', () => {
  test('acepta una plantilla word de 30 frames x 128', () => {
    assert.doesNotThrow(() =>
      svc.ensureIsValid({ label: 'triste', kind: 'word', features: frames(WORD_SEQ_LEN, WORD_DIM) }),
    );
  });

  test('rechaza una plantilla word con el formato del motor viejo', () => {
    assert.throws(
      () => svc.ensureIsValid({ label: 'triste', kind: 'word', features: frames(16, 126) }),
      InvalidSignTemplateError,
    );
  });

  test('rechaza una plantilla word con frames de otro tamano', () => {
    assert.throws(
      () => svc.ensureIsValid({ label: 'triste', kind: 'word', features: frames(WORD_SEQ_LEN, 126) }),
      InvalidSignTemplateError,
    );
  });

  test('sigue aceptando motion de 16 x 126', () => {
    assert.doesNotThrow(() => svc.ensureIsValid({ label: 'hola', kind: 'motion', features: frames(16, 126) }));
  });

  test('rechaza kind desconocido', () => {
    assert.throws(
      () => svc.ensureIsValid({ label: 'hola', kind: 'nope' as never, features: frames(1, 63) }),
      InvalidSignTemplateError,
    );
  });
});
