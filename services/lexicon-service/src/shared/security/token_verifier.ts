/** Usuario autenticado tal como lo ve este servicio. */
export interface AuthenticatedUser {
  userId: number;
  email: string;
  /** Vacio si el token no trae roles (iam aun no los emite). */
  roles: string[];
}

/** Este servicio solo verifica tokens; los emite iam. */
export interface TokenVerifier {
  verify(token: string): AuthenticatedUser;
}
