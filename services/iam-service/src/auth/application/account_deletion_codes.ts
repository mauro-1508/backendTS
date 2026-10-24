import { AuthRepository } from '../ports/outbound/auth_repository';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { Mailer } from '../ports/outbound/mailer';
import { authDomainService, MAX_ATTEMPTS } from '../domain/service';
import { DeletionCodes } from '../../users/ports/outbound/deletion_codes';

const TOKEN_TYPE = 'ACCOUNT_DELETION';

/** Implementa los codigos de borrado de cuenta con el mismo mecanismo que verificacion y recuperacion. */
export const makeAccountDeletionCodes = (deps: {
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
  mailer: Mailer;
  now?: () => Date;
}): DeletionCodes => {
  const now = () => (deps.now ?? (() => new Date()))();

  return {
    send: async ({ userId, email, name }) => {
      const at = now();
      const code = authDomainService.generateCode();
      const result = await deps.authRepository.issueTokenIfAllowed({
        userId,
        type: TOKEN_TYPE,
        hashToken: () => deps.passwordHasher.hash(code),
        expiresAt: authDomainService.codeExpiryDate(at),
        now: at,
        decide: (last, sent) => authDomainService.issueDecision(last, sent, at),
      });
      if (result === 'issued') await deps.mailer.sendAccountDeletionCode({ to: email, name, code });
      return result;
    },

    check: async (userId, code) => {
      // Reserva el intento antes de comparar (atomico): peticiones en paralelo no superan MAX_ATTEMPTS.
      const token = await deps.authRepository.reserveAttempt(userId, TOKEN_TYPE, now(), MAX_ATTEMPTS);
      // Sin token igual se compara (contra un hash ficticio) para no revelar por tiempo si existe.
      const ok = await deps.passwordHasher.compare(code, token?.tokenHash ?? null);
      return Boolean(token) && ok;
    },
  };
};
