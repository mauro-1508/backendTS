export type { AuthenticatedUser, TokenProvider } from '@traduce/shared';

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hashed: string): Promise<boolean>;
}
