export interface PasswordResetToken {
  tokenId: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  /** Codigos erroneos ya probados contra este token. */
  attempts: number;
}
