export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface GoogleLoginInput {
  /** ID token que Google entrega al cliente; el backend lo verifica, nunca confia en correo o nombre enviados aparte. */
  idToken: string;
}

export interface FacebookLoginInput {
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
