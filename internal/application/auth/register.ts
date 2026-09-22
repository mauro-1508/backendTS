import { UserRepository } from '../../ports/outbound/user_repository';
import { PasswordHasher } from '../../ports/outbound/auth_provider';
import { userDomainService } from '../../domain/user/service';
import { AuthResult, RegisterInput } from '../../ports/inbound/auth_service';

export const makeRegister = (deps: { userRepository: UserRepository; passwordHasher: PasswordHasher }) =>
  async ({ name, email, password }: RegisterInput): Promise<AuthResult> => {
    userDomainService.ensureRegistrationIsValid({ name, email, password });

    const existingUser = await deps.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('Ya existe un usuario con ese correo');
    }

    const hashedPassword = await deps.passwordHasher.hash(password);
    const newUser = await deps.userRepository.create({ name, email, password: hashedPassword });

    return {
      success: true,
      message: 'Usuario registrado correctamente',
      data: { user_id: newUser.userId, name: newUser.name, email: newUser.email },
    };
  };
