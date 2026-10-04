import { PasswordResetToken } from './entity';

export interface AuthRepository {
  createResetToken(params: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ tokenId: number }>;
  /** El codigo vigente del usuario: el mas reciente que no se haya usado ni invalidado. */
  findActiveResetToken(userId: number): Promise<PasswordResetToken | null>;
  registerFailedAttempt(tokenId: number): Promise<void>;
  markTokenAsUsed(tokenId: number): Promise<void>;
  /** Invalida todos los codigos pendientes del usuario (se llama antes de emitir uno nuevo). */
  invalidateResetTokens(userId: number): Promise<void>;
}
