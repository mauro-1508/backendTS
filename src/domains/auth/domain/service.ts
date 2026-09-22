import { createHash } from 'crypto';
import { PasswordResetToken } from './entity';

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

export class InvalidResetCodeError extends Error {}
export class ExpiredResetCodeError extends Error {}
export class UsedResetCodeError extends Error {}

export const authDomainService = {
  generateResetCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  hashResetCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  },

  resetCodeExpiryDate(): Date {
    return new Date(Date.now() + RESET_CODE_TTL_MS);
  },

  ensureResetTokenIsUsable(token: PasswordResetToken | null, userId: number): void {
    if (!token) {
      throw new InvalidResetCodeError('Código inválido');
    }
    if (token.usedAt) {
      throw new UsedResetCodeError('Este código ya fue utilizado');
    }
    if (new Date() > new Date(token.expiresAt)) {
      throw new ExpiredResetCodeError('El código ha expirado');
    }
    if (token.userId !== userId) {
      throw new InvalidResetCodeError('Código inválido');
    }
  },
};
