import { describe, expect, it } from 'vitest';
import { authDomainService as s, InvalidCodeError } from '../../../src/domains/auth/domain/service';

const now = new Date('2026-01-01T12:00:00Z');

describe('generateCode', () => {
  it('rellena con ceros a la izquierda a 6 digitos', () => {
    expect(s.generateCode(() => 42)).toBe('000042');
    expect(s.generateCode(() => 0)).toBe('000000');
    expect(s.generateCode(() => 999_999)).toBe('999999');
  });
  it('pide un entero en [0, 1_000_000)', () => {
    let range: number[] = [];
    s.generateCode((min, max) => ((range = [min, max]), 1));
    expect(range).toEqual([0, 1_000_000]);
    expect(s.generateCode()).toMatch(/^\d{6}$/);
  });
});

describe('codeExpiryDate', () => {
  it('son 15 minutos', () => {
    expect(s.codeExpiryDate(now).getTime() - now.getTime()).toBe(15 * 60 * 1000);
  });
});

describe('InvalidCodeError', () => {
  it('es 400 INVALID_CODE', () => {
    expect(new InvalidCodeError()).toMatchObject({ code: 'INVALID_CODE', httpStatus: 400 });
  });
});

describe('issueDecision', () => {
  it('distingue el motivo', () => {
    expect(s.issueDecision(null, 0, now)).toBe('ok');
    expect(s.issueDecision(new Date(now.getTime() - 1000), 1, now)).toBe('cooldown');
    expect(s.issueDecision(new Date(now.getTime() - 600_000), 5, now)).toBe('hourly_limit');
  });
});

describe('canIssueToken', () => {
  it('primer envio permitido', () => expect(s.canIssueToken(null, 0, now)).toBe(true));
  it('bloquea dentro de 60 s', () => {
    expect(s.canIssueToken(new Date(now.getTime() - 59_999), 1, now)).toBe(false);
    expect(s.canIssueToken(new Date(now.getTime() - 60_000), 1, now)).toBe(true);
  });
  it('bloquea a partir de 5 envios por hora', () => {
    const old = new Date(now.getTime() - 600_000);
    expect(s.canIssueToken(old, 4, now)).toBe(true);
    expect(s.canIssueToken(old, 5, now)).toBe(false);
  });
});
