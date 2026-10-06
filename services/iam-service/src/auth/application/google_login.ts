import { EventPublisher } from '@traduce/shared';
import { UserRepository } from '../../users/ports/outbound/user_repository';
import { normalizeEmail } from '../../users/domain/service';
import { TokenProvider } from '../ports/outbound/auth_provider';
import { AuthResult, GoogleLoginInput } from '../ports/inbound/auth_service';
import { AccountBlockedError, EmailNotVerifiedError, RegistrationFailedError, ValidationError } from '../domain/service';
import { RoleAssigner } from '../ports/outbound/role_assigner';
import { RoleReader } from '../ports/outbound/role_reader';
import { signSession } from './sign_session';
import { publishUserRegistered } from './publish_registered';

export const makeGoogleLogin = (deps: {
  userRepository: UserRepository;
  tokenProvider: TokenProvider;
  roleAssigner: RoleAssigner;
  roleReader: RoleReader;
  eventPublisher: EventPublisher;
}) =>
  async ({ email: rawEmail, name }: GoogleLoginInput): Promise<AuthResult> => {
    if (!rawEmail || !name) {
      throw new ValidationError('Email y nombre son obligatorios');
    }

    const email = normalizeEmail(rawEmail);
    const existingUser = await deps.userRepository.findByEmail(email);
    if (existingUser) {
      // Sin correo verificado (o bloqueada) tampoco hay sesion por Google: evita el secuestro previo de cuentas.
      if (existingUser.status === 'BLOCKED') throw new AccountBlockedError();
      if (existingUser.status !== 'ACTIVE') throw new EmailNotVerifiedError();
      const token = await signSession(deps, existingUser);
      return { success: true, message: 'Inicio de sesión exitoso', data: { token } };
    }

    const newUser = await deps.userRepository.create({ email, name, password: null, status: 'ACTIVE', emailVerifiedAt: new Date() });
    // Cuenta nueva: mismo rol por defecto que en el registro.
    try {
      await deps.roleAssigner.assignDefaultRole(newUser.userId);
    } catch {
      // Compensacion: no dejar una cuenta sin rol; el detalle interno no llega al cliente.
      await deps.userRepository.deleteById(newUser.userId);
      throw new RegistrationFailedError();
    }
    await publishUserRegistered(deps.eventPublisher, newUser);
    const token = await signSession(deps, newUser);

    return { success: true, message: 'Cuenta creada y sesión iniciada', data: { token } };
  };
