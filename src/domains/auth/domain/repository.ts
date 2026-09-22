import { PasswordResetToken } from './entity';

export interface AuthRepository {
  createResetToken(params: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<{ tokenId: number }>;
  findResetToken(tokenHash: string): Promise<PasswordResetToken | null>;
  markTokenAsUsed(tokenId: number): Promise<void>;
}
