export interface PasswordResetToken {
  tokenId: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}
