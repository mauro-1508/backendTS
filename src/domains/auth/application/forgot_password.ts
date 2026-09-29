import { UserRepository } from '../../users/ports/outbound/user_repository';
import { normalizeEmail } from '../../users/domain/service';
import { AuthRepository } from '../ports/outbound/auth_repository';
import { Mailer } from '../ports/outbound/mailer';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { authDomainService, ValidationError } from '../domain/service';
import { AuthResult } from '../ports/inbound/auth_service';

const GENERIC_RESPONSE: AuthResult = { success: true, message: 'Si el correo existe, recibirás un código' };

export const makeForgotPassword = (deps: {
  userRepository: UserRepository;
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
  mailer: Mailer;
  now?: () => Date;
}) => {
  const issueAndSend = async (email: string) => {
    const now = (deps.now ?? (() => new Date()))();
    const user = await deps.userRepository.findByEmail(email);
    // TODO(Parte B): enviar solo si la cuenta esta ACTIVE cuando exista users.status.
    if (!user) return;

    const code = authDomainService.generateCode();
    const result = await deps.authRepository.issueTokenIfAllowed({
      userId: user.userId,
      type: 'PASSWORD_RESET',
      hashToken: () => deps.passwordHasher.hash(code),
      expiresAt: authDomainService.codeExpiryDate(now),
      now,
      // Cooldown y tope horario los decide el dominio, dentro de la transaccion con bloqueo por usuario.
      decide: (last, sent) => authDomainService.issueDecision(last, sent, now),
    });
    if (result !== 'issued') return;
    await deps.mailer.sendPasswordResetCode({ to: user.email, name: user.name, code });
  };

  return async ({ email }: { email: string }): Promise<AuthResult> => {
    if (!email) throw new ValidationError('El email es obligatorio');

    // Todo el trabajo va en segundo plano: la respuesta y su tiempo no dependen de si la cuenta existe.
    issueAndSend(normalizeEmail(email)).catch((error: unknown) => {
      // Solo nombre y codigo del error: error.message puede traer el correo o datos del SMTP.
      const e = error as { name?: string; code?: string } | null;
      console.error('[auth] forgot-password: no se pudo emitir o enviar el código', e?.name ?? 'error', e?.code ?? '');
    });

    return GENERIC_RESPONSE;
  };
};
