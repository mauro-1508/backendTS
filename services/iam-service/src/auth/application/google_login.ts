import { UserRepository } from '../../users/ports/outbound/user_repository';
import { RoleRepository } from '../../users/ports/outbound/role_repository';
import { DEFAULT_ROLE } from '../../users/domain/roles';
import { EVENT_TYPES, EventPublisher, publishQuietly, UserRegistered } from '@traduce/shared';
import { IssueToken } from './issue_token';
import { AuthResult, GoogleLoginInput } from '../ports/inbound/auth_service';

/**
 * TODO(seguridad): esta funcion NO verifica el ID token de Google; confia en el email y el
 * nombre que recibe, asi que cualquiera podria entrar como cualquier correo. Por eso NO
 * esta expuesta como ruta HTTP. Antes de publicarla hay que recibir el `idToken` y validarlo
 * en el servidor (p. ej. con google-auth-library `verifyIdToken`, comprobando audience y
 * `email_verified`), y tomar email y nombre del token verificado, nunca del cuerpo.
 */
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
    const registered: UserRegistered = { userId: newUser.userId, email: newUser.email, name: newUser.name };
    await publishQuietly(deps.eventPublisher, EVENT_TYPES.UserRegistered, registered);
    const token = await deps.issueToken(newUser);

    return { success: true, message: 'Cuenta creada y sesión iniciada', data: { token } };
  };
