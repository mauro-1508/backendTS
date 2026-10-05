import { describe, expect, it } from 'vitest';
import { REFERENCE_TYPES } from '../../../src/domains/analytics/domain/entity';
import { analyticsDomainService as svc, InvalidRangeError, InvalidUsageEventError } from '../../../src/domains/analytics/domain/service';

const valid = { section: 'HOME', eventType: 'SECTION_VIEW', referenceType: null, referenceId: null } as const;
const NOW = new Date('2026-09-28T12:00:00.000Z');

describe('ensureEventIsValid', () => {
  it('acepta un evento valido con y sin referencia', () => {
    expect(() => svc.ensureEventIsValid(valid)).not.toThrow();
    expect(() => svc.ensureEventIsValid({ ...valid, referenceType: 'SIGN', referenceId: 3 })).not.toThrow();
  });

  it('rechaza section y eventType fuera de catalogo', () => {
    expect(() => svc.ensureEventIsValid({ ...valid, section: 'X' as never })).toThrow(InvalidUsageEventError);
    expect(() => svc.ensureEventIsValid({ ...valid, eventType: 'X' as never })).toThrow(InvalidUsageEventError);
  });

  it('rechaza referencia incompleta', () => {
    expect(() => svc.ensureEventIsValid({ ...valid, referenceType: 'SIGN' })).toThrow(InvalidUsageEventError);
    expect(() => svc.ensureEventIsValid({ ...valid, referenceId: 3 })).toThrow(InvalidUsageEventError);
  });
});

describe('referenceType', () => {
  it('acepta los 7 valores del catalogo y rechaza otros', () => {
    for (const t of REFERENCE_TYPES) expect(() => svc.ensureEventIsValid({ ...valid, referenceType: t, referenceId: 1 })).not.toThrow();
    for (const bad of ['juan@correo.com', 'sign', '']) {
      expect(() => svc.ensureEventIsValid({ ...valid, referenceType: bad, referenceId: 1 })).toThrow(InvalidUsageEventError);
    }
  });
});

describe('normalizeRange', () => {
  it('por defecto son los ultimos 30 dias', () => {
    expect(svc.normalizeRange({}, NOW)).toEqual({ from: '2026-08-29T12:00:00.000Z', to: NOW.toISOString() });
  });

  it('to sin hora es el dia siguiente 00:00Z (exclusivo)', () => {
    expect(svc.normalizeRange({ from: '2026-09-01', to: '2026-09-10' }, NOW)).toEqual({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-11T00:00:00.000Z',
    });
  });

  it('to con hora es ese instante exclusivo', () => {
    expect(svc.normalizeRange({ from: '2026-09-01', to: '2026-09-10T10:00:00.000Z' }, NOW).to).toBe('2026-09-10T10:00:00.000Z');
  });

  it('solo to: from = inicio del dia de (to exclusivo - 30 dias), sin horas heredadas', () => {
    expect(svc.normalizeRange({ to: '2026-09-10' }, NOW)).toEqual({ from: '2026-08-12T00:00:00.000Z', to: '2026-09-11T00:00:00.000Z' });
    expect(svc.normalizeRange({ to: '2026-09-10T15:30:00.000Z' }, NOW)).toEqual({ from: '2026-08-11T00:00:00.000Z', to: '2026-09-10T15:30:00.000Z' });
  });

  it('bordes de 366 dias con fechas sin hora', () => {
    expect(() => svc.normalizeRange({ from: '2024-01-01', to: '2024-12-31' }, NOW)).not.toThrow();
    expect(() => svc.normalizeRange({ from: '2024-01-01', to: '2025-01-01' }, NOW)).toThrow(InvalidRangeError);
  });

  it('rechaza rango invertido, invalido o mayor a 366 dias', () => {
    expect(() => svc.normalizeRange({ from: '2026-09-10', to: '2026-09-01' }, NOW)).toThrow(InvalidRangeError);
    expect(() => svc.normalizeRange({ from: 'nope' }, NOW)).toThrow(InvalidRangeError);
    expect(() => svc.normalizeRange({ from: '2024-01-01', to: '2026-01-01' }, NOW)).toThrow(InvalidRangeError);
  });

  it('acepta exactamente 366 dias', () => {
    expect(() => svc.normalizeRange({ from: '2025-09-01T00:00:00Z', to: '2026-09-02T00:00:00Z' }, NOW)).not.toThrow();
  });
});
