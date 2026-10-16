/** Datos de identidad ya verificados por Google (firma, caducidad, audiencia y emisor comprobados). */
export interface VerifiedGoogleIdentity {
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface GoogleTokenVerifier {
  /** Lanza InvalidGoogleTokenError si el token no es valido; GoogleNotConfiguredError si no hay client IDs. */
  verify(idToken: string): Promise<VerifiedGoogleIdentity>;
}
