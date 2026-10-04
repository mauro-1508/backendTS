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
  email: string;
  name: string;
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
  verifyCode(input: { email: string; code: string }): Promise<AuthResult>;
  resetPassword(input: { email: string; code: string; newPassword: string }): Promise<AuthResult>;
  googleLogin(input: GoogleLoginInput): Promise<AuthResult>;
}
