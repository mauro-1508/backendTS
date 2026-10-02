export type UserTokenType = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

/** Codigo de un solo uso (guardado como hash) ligado a un usuario y a un proposito. */
export interface UserToken {
  tokenId: number;
  userId: number;
  tokenType: UserTokenType;
  tokenHash: string;
  attempts: number;
  expiresAt: Date;
  usedAt: Date | null;
  /** Anulado por un codigo mas nuevo (distinto de usado). */
  revokedAt: Date | null;
  createdAt: Date;
}
