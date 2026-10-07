/** Usuario autenticado tal como lo ven todos los servicios. */
export interface AuthenticatedUser {
  userId: number;
  email: string;
  roles: string[];
  /** Permisos efectivos de sus roles; los calcula iam al firmar el token. */
  permissions: string[];
}

/** Lo que se firma: roles y permisos son opcionales (un token sin ellos no concede nada). */
export type TokenClaims = Pick<AuthenticatedUser, 'userId' | 'email'> &
  Partial<Pick<AuthenticatedUser, 'roles' | 'permissions'>>;

export interface TokenProvider {
  sign(claims: TokenClaims): string;
  verify(token: string): AuthenticatedUser;
}
