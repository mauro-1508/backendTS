import { UserRepository } from '../../ports/outbound/user_repository';
import { AuthRepository } from '../../ports/outbound/auth_repository';
import { authDomainService } from '../../domain/auth/service';
import { AuthResult } from '../../ports/inbound/auth_service';

export const makeVerifyCode = (deps: { userRepository: UserRepository; authRepository: AuthRepository }) =>
  async ({ email, code }: { email: string; code: string }): Promise<AuthResult> => {
    if (!email || !code) {
      throw new Error('Email y código son obligatorios');
    }

    const user = await deps.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Código inválido');
    }

    const tokenHash = authDomainService.hashResetCode(code);
    const resetToken = await deps.authRepository.findResetToken(tokenHash);

    authDomainService.ensureResetTokenIsUsable(resetToken, user.userId);

    return {
      success: true,
      message: 'Código verificado correctamente',
      data: { token_id: resetToken!.tokenId },
    };
  };
