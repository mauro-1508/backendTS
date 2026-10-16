/** Datos de identidad que Facebook devuelve para un access token ya validado contra esta app. */
export interface VerifiedFacebookIdentity {
  /** Null si la cuenta no tiene correo o el usuario no concedio el permiso email. */
  email: string | null;
  name: string | null;
}

export interface FacebookTokenVerifier {
  /** Lanza InvalidFacebookTokenError si el token no es valido o es de otra app; FacebookNotConfiguredError sin App ID/secreto. */
  verify(accessToken: string): Promise<VerifiedFacebookIdentity>;
}
