import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { authDomainService as s, InvalidCodeError } from '../../../src/auth/domain/service';
import { assertMatch } from '../../helpers/fakes';

const now = new Date('2026-01-01T12:00:00Z');

describe('generateCode', () => {
  test('rellena con ceros a la izquierda a 6 digitos', () => {
    assert.equal(s.generateCode(() => 42), '000042');
    assert.equal(s.generateCode(() => 0), '000000');
    assert.equal(s.generateCode(() => 999_999), '999999');
  });
  test('pide un entero en [0, 1_000_000)', () => {
    let range: number[] = [];
    s.generateCode((min, max) => ((range = [min, max]), 1));
    assert.deepEqual(range, [0, 1_000_000]);
    assert.match(s.generateCode(), /^\d{6}$/);
  });
});

describe('codeExpiryDate', () => {
  test('son 15 minutos', () => {
    assert.equal(s.codeExpiryDate(now).getTime() - now.getTime(), 15 * 60 * 1000);
  });
});

describe('InvalidCodeError', () => {
  test('es 400 INVALID_CODE', () => {
    assertMatch(new InvalidCodeError(), { code: 'INVALID_CODE', httpStatus: 400 });
  });
});

describe('issueDecision', () => {
  test('distingue el motivo', () => {
    assert.equal(s.issueDecision(null, 0, now), 'ok');
    assert.equal(s.issueDecision(new Date(now.getTime() - 1000), 1, now), 'cooldown');
    assert.equal(s.issueDecision(new Date(now.getTime() - 600_000), 5, now), 'hourly_limit');
  });
});

describe('canIssueToken', () => {
  test('primer envio permitido', () => assert.equal(s.canIssueToken(null, 0, now), true));
  test('bloquea dentro de 60 s', () => {
    assert.equal(s.canIssueToken(new Date(now.getTime() - 59_999), 1, now), false);
    assert.equal(s.canIssueToken(new Date(now.getTime() - 60_000), 1, now), true);
  });
  test('bloquea a partir de 5 envios por hora', () => {
    const old = new Date(now.getTime() - 600_000);
    assert.equal(s.canIssueToken(old, 4, now), true);
    assert.equal(s.canIssueToken(old, 5, now), false);
  });
});
