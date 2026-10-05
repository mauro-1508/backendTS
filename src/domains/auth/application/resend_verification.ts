import { UserRepository } from '../../users/ports/outbound/user_repository';
import { normalizeEmail } from '../../users/domain/service';
import { AuthRepository } from '../ports/outbound/auth_repository';
import { Mailer } from '../ports/outbound/mailer';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { ValidationError } from '../domain/service';
import { AuthResult } from '../ports/inbound/auth_service';
import { issueAndSendVerification } from './issue_verification';

const GENERIC_RESPONSE: AuthResult = { success: true, message: 'Si la cuenta está pendiente de verificación, recibirás un código' };

export const makeResendVerification = (deps: {
  userRepository: UserRepository;
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
  mailer: Mailer;
  now?: () => Date;
}) => {
  const work = async (email: string) => {
    const user = await deps.userRepository.findByEmail(email);
    if (!user || user.status !== 'INACTIVE') return;
    await issueAndSendVerification(deps, user, (deps.now ?? (() => new Date()))());
  };

  return async ({ email }: { email: string }): Promise<AuthResult> => {
    if (!email) throw new ValidationError('El email es obligatorio');

    // En segundo plano: respuesta y tiempo no dependen de si la cuenta existe, esta activa o pasa el limite.
    work(normalizeEmail(email)).catch((error: unknown) => {
      const e = error as { name?: string; code?: string } | null;
      console.error('[auth] resend-verification: no se pudo emitir o enviar el código', e?.name ?? 'error', e?.code ?? '');
    });

    return GENERIC_RESPONSE;
  };
};
