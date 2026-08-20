export interface TokenPayload {
  userId: number;
  email: string;
}

export interface TokenProvider {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hashed: string): Promise<boolean>;
}
