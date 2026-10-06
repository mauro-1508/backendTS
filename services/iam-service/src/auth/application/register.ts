import { EventPublisher } from '@traduce/shared';
import { UserRepository } from '../../users/ports/outbound/user_repository';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { normalizeEmail, userDomainService } from '../../users/domain/service';
import { AuthResult, RegisterInput } from '../ports/inbound/auth_service';
import { EmailAlreadyExistsError, RegistrationFailedError } from '../domain/service';
import { AuthRepository } from '../ports/outbound/auth_repository';
import { Mailer } from '../ports/outbound/mailer';
import { RoleAssigner } from '../ports/outbound/role_assigner';
import { issueAndSendVerification } from './issue_verification';
import { publishUserRegistered } from './publish_registered';

export const makeRegister = (deps: {
  userRepository: UserRepository;
  passwordHasher: PasswordHasher;
  roleAssigner: RoleAssigner;
  authRepository: AuthRepository;
  mailer: Mailer;
  eventPublisher: EventPublisher;
  now?: () => Date;
}) =>
  async ({ name, email: rawEmail, password }: RegisterInput): Promise<AuthResult> => {
    userDomainService.ensureRegistrationIsValid({ name, email: rawEmail, password });
    const email = normalizeEmail(rawEmail);

    const existingUser = await deps.userRepository.findByEmail(email);
    if (existingUser) {
      throw new EmailAlreadyExistsError();
    }

    const hashedPassword = await deps.passwordHasher.hash(password);
    // La cuenta nace INACTIVE (pendiente de verificar el correo).
    const newUser = await deps.userRepository.create({ name, email, password: hashedPassword, status: 'INACTIVE' });
    // Toda cuenta debe tener al menos un rol (USER), o queda sin permisos.
    try {
      await deps.roleAssigner.assignDefaultRole(newUser.userId);
    } catch {
      // Compensacion: no dejar una cuenta sin rol; el detalle interno no llega al cliente.
      await deps.userRepository.deleteById(newUser.userId);
      throw new RegistrationFailedError();
    }
    await publishUserRegistered(deps.eventPublisher, newUser);

    // Si el envio falla la cuenta se conserva: el usuario puede pedir otro codigo (resend-verification).
    let verificationEmailSent = false;
    try {
      verificationEmailSent = await issueAndSendVerification(deps, newUser, (deps.now ?? (() => new Date()))());
    } catch (error) {
      // Solo nombre y codigo: error.message puede traer el correo o datos del SMTP.
      const e = error as { name?: string; code?: string } | null;
      console.error('[auth] register: no se pudo emitir o enviar el código de verificación', e?.name ?? 'error', e?.code ?? '');
    }

    return {
      success: true,
      message: 'Usuario registrado correctamente',
      data: {
        user_id: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        status: 'INACTIVE',
        verification_email_sent: verificationEmailSent,
      },
    };
  };
