import { AuthRepository } from '../ports/outbound/auth_repository';
import { Mailer } from '../ports/outbound/mailer';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { authDomainService } from '../domain/service';

/**
 * Emite un codigo EMAIL_VERIFICATION (cooldown y tope los decide el dominio dentro de la transaccion; el
 * hash solo se calcula si la decision es 'ok') y lo envia. Devuelve true si se emitio y envio; false si la
 * emision fue rechazada. Si el envio falla, lanza (quien llama decide que hacer).
 */
export const issueAndSendVerification = async (
  deps: { authRepository: AuthRepository; passwordHasher: PasswordHasher; mailer: Mailer },
  user: { userId: number; name: string; email: string },
  now: Date
): Promise<boolean> => {
  const code = authDomainService.generateCode();
  const result = await deps.authRepository.issueTokenIfAllowed({
    userId: user.userId,
    type: 'EMAIL_VERIFICATION',
    hashToken: () => deps.passwordHasher.hash(code),
    expiresAt: authDomainService.codeExpiryDate(now),
    now,
    decide: (last, sent) => authDomainService.issueDecision(last, sent, now),
  });
  if (result !== 'issued') return false;
  await deps.mailer.sendVerificationCode({ to: user.email, name: user.name, code });
  return true;
};
