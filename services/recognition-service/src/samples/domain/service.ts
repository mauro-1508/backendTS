import { MOTION_DIM, STATIC_DIM } from '../../ia/domain/entity';
import { NewGestureSample } from './entity';

export class InvalidSampleError extends Error {}

export const MAX_SIGN_CODE_LENGTH = 50;
export const MAX_SESSION_ID_LENGTH = 64;
export const MAX_PERFORMED_BY_LENGTH = 150;
export const MAX_TERMS_VERSION_LENGTH = 20;
/** Tope de frames de una repeticion (una secuencia de palabra trae 16). */
export const MAX_FRAMES = 64;
const FRAME_DIMS: readonly number[] = [STATIC_DIM, MOTION_DIM];

const requireText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== 'string' || !value.trim()) throw new InvalidSampleError(`${field} es obligatorio`);
  if (value.trim().length > maxLength) throw new InvalidSampleError(`${field} supera ${maxLength} caracteres`);
  return value.trim();
};

const parseConsentDate = (value: unknown): Date => {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new InvalidSampleError('consentGrantedAt es obligatorio y debe ser una fecha ISO valida');
  }
  return date;
};

const parseFrames = (value: unknown): number[][] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FRAMES) {
    throw new InvalidSampleError(`frames debe traer entre 1 y ${MAX_FRAMES} frames`);
  }
  const frameLength = Array.isArray(value[0]) ? value[0].length : 0;
  if (!FRAME_DIMS.includes(frameLength)) {
    throw new InvalidSampleError(`cada frame debe traer ${FRAME_DIMS.join(' o ')} valores`);
  }
  for (const frame of value) {
    if (!Array.isArray(frame) || frame.length !== frameLength) {
      throw new InvalidSampleError('todos los frames deben tener la misma cantidad de valores');
    }
    if (frame.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new InvalidSampleError('los frames deben contener numeros finitos');
    }
  }
  return value as number[][];
};

/**
 * Valida el cuerpo crudo. Sin consentimiento (fecha y version) no hay muestra:
 * son datos biometricos (Ley 1581 de 2012).
 */
export const sampleDomainService = {
  parseNewSample(body: Record<string, unknown>, recordedBy: number): NewGestureSample {
    return {
      signCode: requireText(body.signCode, 'signCode', MAX_SIGN_CODE_LENGTH),
      captureSessionId: requireText(body.captureSessionId, 'captureSessionId', MAX_SESSION_ID_LENGTH),
      recordedBy,
      performedBy: requireText(body.performedBy, 'performedBy', MAX_PERFORMED_BY_LENGTH),
      consentGrantedAt: parseConsentDate(body.consentGrantedAt),
      consentTermsVersion: requireText(body.consentTermsVersion, 'consentTermsVersion', MAX_TERMS_VERSION_LENGTH),
      frames: parseFrames(body.frames),
    };
  },
};
