import { UserRepository } from '../../users/ports/outbound/user_repository';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { userDomainService } from '../../users/domain/service';
import { AuthResult, RegisterInput } from '../ports/inbound/auth_service';
import { AuthError, RegistrationFailedError } from '../domain/service';
import { RoleAssigner } from '../ports/outbound/role_assigner';

export const makeRegister = (deps: { userRepository: UserRepository; passwordHasher: PasswordHasher; roleAssigner: RoleAssigner }) =>
  async ({ name, email, password }: RegisterInput): Promise<AuthResult> => {
    userDomainService.ensureRegistrationIsValid({ name, email, password });

    const existingUser = await deps.userRepository.findByEmail(email);
    if (existingUser) {
      throw new AuthError('Ya existe un usuario con ese correo');
    }

    const hashedPassword = await deps.passwordHasher.hash(password);
    const newUser = await deps.userRepository.create({ name, email, password: hashedPassword });
    // Toda cuenta debe tener al menos un rol (USER), o queda sin permisos.
    try {
      await deps.roleAssigner.assignDefaultRole(newUser.userId);
    } catch {
      // Compensacion: no dejar una cuenta sin rol; el detalle interno no llega al cliente.
      await deps.userRepository.deleteById(newUser.userId);
      throw new RegistrationFailedError();
    }

    return {
      success: true,
      message: 'Usuario registrado correctamente',
      data: { user_id: newUser.userId, name: newUser.name, email: newUser.email },
    };
  };
