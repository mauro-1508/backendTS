import { UserRepository } from '../../ports/outbound/user_repository';
import { AuthRepository } from '../../ports/outbound/auth_repository';
import { PasswordHasher } from '../../ports/outbound/auth_provider';
import { AuthResult } from '../../ports/inbound/auth_service';
import { makeVerifyCode } from './verify_code';

export const makeResetPassword = (deps: {
  userRepository: UserRepository;
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
}) => {
  const verifyCode = makeVerifyCode(deps);

  return async ({
    email,
    code,
    newPassword,
  }: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<AuthResult> => {
    if (!email || !code || !newPassword) {
      throw new Error('Email, código y nueva contraseña son obligatorios');
    }
    if (newPassword.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres');
    }

    const verification = await verifyCode({ email, code });

    const hashedPassword = await deps.passwordHasher.hash(newPassword);
    const user = await deps.userRepository.findByEmail(email);
    await deps.userRepository.updatePassword(user!.userId, hashedPassword);

    const tokenId = (verification.data as { token_id: number }).token_id;
    await deps.authRepository.markTokenAsUsed(tokenId);

    return { success: true, message: 'Contraseña actualizada correctamente' };
  };
};
