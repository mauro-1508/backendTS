import { UserRepository } from '../../users/ports/outbound/user_repository';
import { PasswordHasher, TokenProvider } from '../ports/outbound/auth_provider';
import { AuthError } from '../domain/service';
import { AuthResult, LoginInput } from '../ports/inbound/auth_service';

export const makeLogin = (deps: {
  userRepository: UserRepository;
  passwordHasher: PasswordHasher;
  tokenProvider: TokenProvider;
}) =>
  async ({ email, password }: LoginInput): Promise<AuthResult> => {
    if (!email || !password) {
      throw new AuthError('Email y contraseña son obligatorios');
    }

    const user = await deps.userRepository.findByEmail(email);
    if (!user || !user.password) {
      throw new AuthError('Credenciales inválidas');
    }

    const isPasswordValid = await deps.passwordHasher.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AuthError('Credenciales inválidas');
    }

    const token = deps.tokenProvider.sign({ userId: user.userId, email: user.email });

    return {
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        token,
        user: { user_id: user.userId, name: user.name, email: user.email },
      },
    };
  };
