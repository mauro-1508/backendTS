import { EVENT_TYPES, EventPublisher, publishQuietly, UserRegistered } from '@traduce/shared';
import { UserRepository } from '../../users/ports/outbound/user_repository';
import { RoleRepository } from '../../users/ports/outbound/role_repository';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { DEFAULT_ROLE } from '../../users/domain/roles';
import { userDomainService } from '../../users/domain/service';
import { AuthResult, RegisterInput } from '../ports/inbound/auth_service';

export const makeRegister = (deps: {
  userRepository: UserRepository;
  roleRepository: RoleRepository;
  passwordHasher: PasswordHasher;
  eventPublisher: EventPublisher;
}) =>
  async ({ name, email, password }: RegisterInput): Promise<AuthResult> => {
    userDomainService.ensureRegistrationIsValid({ name, email, password });

    const existingUser = await deps.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('Ya existe un usuario con ese correo');
    }

    const hashedPassword = await deps.passwordHasher.hash(password);
    const newUser = await deps.userRepository.create({ name, email, password: hashedPassword });
    await deps.roleRepository.assignRole(newUser.userId, DEFAULT_ROLE);

    const registered: UserRegistered = { userId: newUser.userId, email: newUser.email, name: newUser.name };
    await publishQuietly(deps.eventPublisher, EVENT_TYPES.UserRegistered, registered);

    return {
      success: true,
      message: 'Usuario registrado correctamente',
      data: { user_id: newUser.userId, name: newUser.name, email: newUser.email },
    };
  };
