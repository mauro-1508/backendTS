import { UserRepository } from '../../users/ports/outbound/user_repository';
import { AuthRepository } from '../ports/outbound/auth_repository';
import { authDomainService, InvalidResetCodeError } from '../domain/service';
import { AuthResult } from '../ports/inbound/auth_service';

export const makeVerifyCode = (deps: { userRepository: UserRepository; authRepository: AuthRepository }) =>
  async ({ email, code }: { email: string; code: string }): Promise<AuthResult> => {
    if (!email || !code) {
      throw new Error('Email y código son obligatorios');
    }

    const user = await deps.userRepository.findByEmail(email);
    if (!user) {
      throw new InvalidResetCodeError('Código inválido');
    }

    const activeToken = await deps.authRepository.findActiveResetToken(user.userId);
    const resetToken = authDomainService.ensureResetTokenIsUsable(activeToken);

    if (!authDomainService.codeMatchesToken(code, resetToken)) {
      await deps.authRepository.registerFailedAttempt(resetToken.tokenId);
      throw new InvalidResetCodeError('Código inválido');
    }

    return {
      success: true,
      message: 'Código verificado correctamente',
      data: { token_id: resetToken.tokenId },
    };
  };
