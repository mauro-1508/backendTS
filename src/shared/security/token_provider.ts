export interface TokenPayload {
  userId: number;
  email: string;
}

export interface TokenProvider {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload;
}
