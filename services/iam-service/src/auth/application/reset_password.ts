import { UserRepository } from '../../users/ports/outbound/user_repository';
import { AuthRepository } from '../ports/outbound/auth_repository';
import { PasswordHasher } from '../ports/outbound/auth_provider';
import { InvalidCodeError, ValidationError } from '../domain/service';
import { AuthResult } from '../ports/inbound/auth_service';
import { makeCheckResetCode } from './verify_code';

export const makeResetPassword = (deps: {
  userRepository: UserRepository;
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
  now?: () => Date;
}) => {
  const check = makeCheckResetCode(deps);

  return async ({ email, code, newPassword }: { email: string; code: string; newPassword: string }): Promise<AuthResult> => {
    if (!email || !code || !newPassword) {
      throw new ValidationError('Email, código y nueva contraseña son obligatorios');
    }
    if (newPassword.length < 8) {
      throw new ValidationError('La contraseña debe tener al menos 8 caracteres');
    }

    const { user, token } = await check(email, code);
    const hashedPassword = await deps.passwordHasher.hash(newPassword);

    // Consumo atomico: si otra peticion gano la carrera, el token ya no sirve.
    const done = await deps.authRepository.consumeAndResetPassword(token.tokenId, user.userId, hashedPassword);
    if (!done) throw new InvalidCodeError();

    return { success: true, message: 'Contraseña actualizada correctamente' };
  };
};
