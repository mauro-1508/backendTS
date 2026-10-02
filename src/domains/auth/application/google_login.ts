import { UserRepository } from '../../users/ports/outbound/user_repository';
import { TokenProvider } from '../ports/outbound/auth_provider';
import { AuthResult, GoogleLoginInput } from '../ports/inbound/auth_service';
import { AuthError, RegistrationFailedError } from '../domain/service';
import { RoleAssigner } from '../ports/outbound/role_assigner';

export const makeGoogleLogin = (deps: { userRepository: UserRepository; tokenProvider: TokenProvider; roleAssigner: RoleAssigner }) =>
  async ({ email, name }: GoogleLoginInput): Promise<AuthResult> => {
    if (!email || !name) {
      throw new AuthError('Email y nombre son obligatorios');
    }

    const existingUser = await deps.userRepository.findByEmail(email);
    if (existingUser) {
      const token = deps.tokenProvider.sign({ userId: existingUser.userId, email: existingUser.email });
      return { success: true, message: 'Inicio de sesión exitoso', data: { token } };
    }

    const newUser = await deps.userRepository.create({ email, name, password: null });
    // Cuenta nueva: mismo rol por defecto que en el registro.
    try {
      await deps.roleAssigner.assignDefaultRole(newUser.userId);
    } catch {
      // Compensacion: no dejar una cuenta sin rol; el detalle interno no llega al cliente.
      await deps.userRepository.deleteById(newUser.userId);
      throw new RegistrationFailedError();
    }
    const token = deps.tokenProvider.sign({ userId: newUser.userId, email: newUser.email });

    return { success: true, message: 'Cuenta creada y sesión iniciada', data: { token } };
  };
