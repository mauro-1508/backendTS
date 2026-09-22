export type { TokenPayload, TokenProvider } from '../../../../shared/security/token_provider';

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hashed: string): Promise<boolean>;
}
