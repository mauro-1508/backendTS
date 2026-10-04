import {
  DateRange, REFERENCE_TYPES, ReferenceType, USAGE_EVENT_TYPES, USAGE_SECTIONS, UsageEventType, UsageSection,
} from './entity';

/** Error de dominio: lleva su `code` publico y el estado HTTP con que se responde. */
export abstract class AnalyticsError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
}

export class AnalyticsValidationError extends AnalyticsError {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = 400;
}

export const DEFAULT_TOP_SIGNS_LIMIT = 10;
export const MAX_TOP_SIGNS_LIMIT = 100;
/** Eventos que un cliente puede registrar; el resto solo los producen otros servicios. */
export const CLIENT_EVENT_TYPES: readonly UsageEventType[] = USAGE_EVENT_TYPES.filter(type => type !== 'USER_REGISTERED');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRealDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

export const parseDateRange = (from: unknown, to: unknown): DateRange => {
  if (typeof from !== 'string' || typeof to !== 'string' || !isRealDate(from) || !isRealDate(to)) {
    throw new AnalyticsValidationError('from y to son obligatorios con formato YYYY-MM-DD');
  }
  if (from > to) throw new AnalyticsValidationError('from no puede ser posterior a to');
  return { from, to };
};

export const parseLimit = (value: unknown): number => {
  if (value === undefined) return DEFAULT_TOP_SIGNS_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TOP_SIGNS_LIMIT) {
    throw new AnalyticsValidationError(`limit debe ser un entero entre 1 y ${MAX_TOP_SIGNS_LIMIT}`);
  }
  return limit;
};

const oneOf = <T extends string>(allowed: readonly T[], field: string, value: unknown): T => {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new AnalyticsValidationError(`${field} debe ser uno de: ${allowed.join(', ')}`);
};

export const parseSection = (value: unknown): UsageSection => oneOf(USAGE_SECTIONS, 'section', value);
export const parseClientEventType = (value: unknown): UsageEventType => oneOf(CLIENT_EVENT_TYPES, 'eventType', value);
export const parseReferenceType = (value: unknown): ReferenceType => oneOf(REFERENCE_TYPES, 'referenceType', value);

export const parseUuid = (field: string, value: unknown): string => {
  if (typeof value === 'string' && UUID_PATTERN.test(value)) return value;
  throw new AnalyticsValidationError(`${field} debe ser un UUID`);
};
