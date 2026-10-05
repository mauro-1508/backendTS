export interface TokenPayload {
  userId: number;
  email: string;
  /** Nombres de rol; solo se firman en el token (los lee el servicio lexicon con ROLE_SOURCE=jwt). */
  roles?: string[];
}

export interface TokenProvider {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload;
}
