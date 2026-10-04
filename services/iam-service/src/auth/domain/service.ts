import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PasswordResetToken } from './entity';

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_CODE_MIN = 100_000;
const RESET_CODE_MAX_EXCLUSIVE = 1_000_000;
export const MAX_RESET_ATTEMPTS = 5;

export class InvalidResetCodeError extends Error {}
export class ExpiredResetCodeError extends Error {}
export class UsedResetCodeError extends Error {}
export class TooManyResetAttemptsError extends Error {}

export const authDomainService = {
  /** Codigo de 6 digitos con generador criptografico. */
  generateResetCode(): string {
    return randomInt(RESET_CODE_MIN, RESET_CODE_MAX_EXCLUSIVE).toString();
  },

  hashResetCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  },

  resetCodeExpiryDate(): Date {
    return new Date(Date.now() + RESET_CODE_TTL_MS);
  },

  codeMatchesToken(code: string, token: PasswordResetToken): boolean {
    const candidate = Buffer.from(authDomainService.hashResetCode(code));
    const stored = Buffer.from(token.tokenHash);
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  },

  ensureResetTokenIsUsable(token: PasswordResetToken | null): PasswordResetToken {
    if (!token) {
      throw new InvalidResetCodeError('Código inválido');
    }
    if (token.usedAt) {
      throw new UsedResetCodeError('Este código ya fue utilizado');
    }
    if (token.attempts >= MAX_RESET_ATTEMPTS) {
      throw new TooManyResetAttemptsError('Demasiados intentos: solicita un código nuevo');
    }
    if (new Date() > new Date(token.expiresAt)) {
      throw new ExpiredResetCodeError('El código ha expirado');
    }
    return token;
  },
};
