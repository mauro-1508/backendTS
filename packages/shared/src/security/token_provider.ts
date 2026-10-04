/** Usuario autenticado tal como lo ven todos los servicios. */
export interface AuthenticatedUser {
  userId: number;
  email: string;
  roles: string[];
}

export interface TokenProvider {
  sign(user: AuthenticatedUser): string;
  verify(token: string): AuthenticatedUser;
}
