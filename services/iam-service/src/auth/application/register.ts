import { EventPublisher } from '@traduce/shared';
import { UserRepository } from '../../users/ports/outbound/user_repository';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { userDomainService } from '../../users/domain/service';
import { AuthResult, RegisterInput } from '../ports/inbound/auth_service';
import { publishUserRegistered } from './publish_user_registered';

export const makeRegister = (deps: {
  userRepository: UserRepository;
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

    await publishUserRegistered(deps.eventPublisher, {
      userId: newUser.userId,
      email: newUser.email,
      name: newUser.name,
    });

    return {
      success: true,
      message: 'Usuario registrado correctamente',
      data: { user_id: newUser.userId, name: newUser.name, email: newUser.email },
    };
  };
