export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  /** Consentimiento expreso de terminos y tratamiento de datos (Ley 1581). */
  acceptedTerms: boolean;
  /** Version de los terminos que vio la persona, p. ej. "2025-01". */
  termsVersion: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Consentimiento (Ley 1581) que la app manda en el login social; solo se exige al crear la cuenta. */
export interface SocialConsentInput {
  acceptedTerms?: boolean;
  termsVersion?: string;
}

export interface GoogleLoginInput extends SocialConsentInput {
  /** ID token que Google entrega al cliente; el backend lo verifica, nunca confia en correo o nombre enviados aparte. */
  idToken: string;
}

export interface FacebookLoginInput extends SocialConsentInput {
  /** Access token que Facebook entrega al cliente; el backend lo valida con la Graph API. */
  accessToken: string;
}

export interface AuthResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface AuthService {
  register(input: RegisterInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  forgotPassword(input: { email: string }): Promise<AuthResult>;
  verifyEmail(input: { email: string; code: string; password: string }): Promise<AuthResult>;
  resendVerification(input: { email: string }): Promise<AuthResult>;
  verifyCode(input: { email: string; code: string }): Promise<AuthResult>;
  resetPassword(input: { email: string; code: string; newPassword: string }): Promise<AuthResult>;
  googleLogin(input: GoogleLoginInput): Promise<AuthResult>;
  facebookLogin(input: FacebookLoginInput): Promise<AuthResult>;
}
