import { UserRepository } from '../../users/ports/outbound/user_repository';
import { normalizeEmail } from '../../users/domain/service';
import { AuthRepository } from '../ports/outbound/auth_repository';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { DUMMY_HASH, InvalidCodeError, MAX_ATTEMPTS, ValidationError } from '../domain/service';
import { AuthResult } from '../ports/inbound/auth_service';

/**
 * Verifica el correo con el codigo de 6 digitos Y la contrasena de la cuenta, y la activa (evita que quien
 * no creo la cuenta la active con el codigo). El intento se reserva antes de cualquier bcrypt; cualquier
 * fallo (desconocido, no INACTIVE, sin codigo vivo, caducado, agotado, codigo o contrasena incorrectos)
 * da el mismo InvalidCodeError tras DOS comparaciones bcrypt (DUMMY_HASH donde falte). No inicia sesion.
 */
export const makeVerifyEmail = (deps: {
  userRepository: UserRepository;
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
  now?: () => Date;
}) =>
  async ({ email, code, password }: { email: string; code: string; password: string }): Promise<AuthResult> => {
    if (!email || !code || !password) throw new ValidationError('Email, código y contraseña son obligatorios');

    const found = await deps.userRepository.findByEmail(normalizeEmail(email));
    const user = found && found.status === 'INACTIVE' ? found : null;
    const token = user
      ? await deps.authRepository.reserveAttempt(user.userId, 'EMAIL_VERIFICATION', (deps.now ?? (() => new Date()))(), MAX_ATTEMPTS)
      : null;

    const codeOk = await deps.passwordHasher.compare(code, token ? token.tokenHash : DUMMY_HASH);
    const passwordOk = await deps.passwordHasher.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !token || !codeOk || !passwordOk) throw new InvalidCodeError();

    if (!(await deps.authRepository.consumeAndActivate(token.tokenId, user.userId))) throw new InvalidCodeError();
    return { success: true, message: 'Correo verificado correctamente' };
  };
