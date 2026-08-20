import { UserRepository } from '../../ports/outbound/user_repository';
import { TokenProvider } from '../../ports/outbound/auth_provider';
import { AuthResult, GoogleLoginInput } from '../../ports/inbound/auth_service';

export const makeGoogleLogin = (deps: { userRepository: UserRepository; tokenProvider: TokenProvider }) =>
  async ({ email, name }: GoogleLoginInput): Promise<AuthResult> => {
    if (!email || !name) {
      throw new Error('Email y nombre son obligatorios');
    }

    const existingUser = await deps.userRepository.findByEmail(email);
    if (existingUser) {
      const token = deps.tokenProvider.sign({ userId: existingUser.userId, email: existingUser.email });
      return { success: true, message: 'Inicio de sesión exitoso', data: { token } };
    }

    const newUser = await deps.userRepository.create({ email, name, password: null });
    const token = deps.tokenProvider.sign({ userId: newUser.userId, email: newUser.email });

    return { success: true, message: 'Cuenta creada y sesión iniciada', data: { token } };
  };
