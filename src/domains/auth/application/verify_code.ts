import { UserRepository } from '../../users/ports/outbound/user_repository';
import { normalizeEmail } from '../../users/domain/service';
import { AuthRepository } from '../ports/outbound/auth_repository';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { DUMMY_HASH, InvalidCodeError, MAX_ATTEMPTS, ValidationError } from '../domain/service';
import { AuthResult } from '../ports/inbound/auth_service';

type Deps = { userRepository: UserRepository; authRepository: AuthRepository; passwordHasher: PasswordHasher; now?: () => Date };

/**
 * Comprueba el codigo de recuperacion. Reserva el intento ANTES de comparar (atomico), asi que las
 * peticiones en paralelo no superan MAX_ATTEMPTS. Cualquier fallo (correo desconocido, sin codigo vivo,
 * caducado, usado, revocado, agotado o incorrecto) da el mismo InvalidCodeError y hace una comparacion bcrypt.
 * Un codigo viejo revocado no se distingue de uno erroneo: gasta un intento del codigo vigente.
 */
export const makeCheckResetCode = (deps: Deps) =>
  async (rawEmail: string, code: string) => {
    if (!rawEmail || !code) throw new ValidationError('Email y código son obligatorios');

    const user = await deps.userRepository.findByEmail(normalizeEmail(rawEmail));
    const token = user
      ? await deps.authRepository.reserveAttempt(user.userId, 'PASSWORD_RESET', (deps.now ?? (() => new Date()))(), MAX_ATTEMPTS)
      : null;

    const ok = await deps.passwordHasher.compare(code, token ? token.tokenHash : DUMMY_HASH);
    if (!user || !token || !ok) throw new InvalidCodeError();

    await deps.authRepository.releaseAttempt(token.tokenId);
    return { user, token };
  };

export const makeVerifyCode = (deps: Deps) => {
  const check = makeCheckResetCode(deps);
  return async ({ email, code }: { email: string; code: string }): Promise<AuthResult> => {
    await check(email, code);
    return { success: true, message: 'Código verificado correctamente' };
  };
};
