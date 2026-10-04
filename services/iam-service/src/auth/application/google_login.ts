import { UserRepository } from '../../users/ports/outbound/user_repository';
import { RoleRepository } from '../../users/ports/outbound/role_repository';
import { DEFAULT_ROLE } from '../../users/domain/roles';
import { EventPublisher } from '@traduce/shared';
import { IssueToken } from './issue_token';
import { publishUserRegistered } from './publish_user_registered';
import { AuthResult, GoogleLoginInput } from '../ports/inbound/auth_service';

export const makeGoogleLogin = (deps: {
  userRepository: UserRepository;
  roleRepository: RoleRepository;
  issueToken: IssueToken;
  eventPublisher: EventPublisher;
}) =>
  async ({ email, name }: GoogleLoginInput): Promise<AuthResult> => {
    if (!email || !name) {
      throw new Error('Email y nombre son obligatorios');
    }

    const existingUser = await deps.userRepository.findByEmail(email);
    if (existingUser) {
      const token = await deps.issueToken(existingUser);
      return { success: true, message: 'Inicio de sesión exitoso', data: { token } };
    }

    const newUser = await deps.userRepository.create({ email, name, password: null });
    await deps.roleRepository.assignRole(newUser.userId, DEFAULT_ROLE);
    await publishUserRegistered(deps.eventPublisher, {
      userId: newUser.userId,
      email: newUser.email,
      name: newUser.name,
    });
    const token = await deps.issueToken(newUser);

    return { success: true, message: 'Cuenta creada y sesión iniciada', data: { token } };
  };
