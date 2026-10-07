import { UserRepository } from '../ports/outbound/user_repository';
import { AccountRepository } from '../ports/outbound/account_repository';
import { PasswordHasher } from '../ports/outbound/password_hasher';
import { accountDomainService, AccountNotFoundError, AccountValidationError, InvalidPasswordError } from '../domain/service';
import { AccountResult } from '../ports/inbound/user_service';

export const makeChangePassword = (deps: {
  userRepository: UserRepository;
  accountRepository: AccountRepository;
  passwordHasher: PasswordHasher;
}) =>
  async (input: { userId: number; currentPassword: string; newPassword: string }): Promise<AccountResult> => {
    accountDomainService.ensureNewPasswordIsValid(input.newPassword);

    const user = await deps.userRepository.findById(input.userId);
    if (!user) throw new AccountNotFoundError();
    // Cuenta sin contraseña (login social): no hay nada contra lo que comparar.
    if (!user.password || !(await deps.passwordHasher.compare(input.currentPassword, user.password))) {
      throw new InvalidPasswordError();
    }
    if (input.newPassword === input.currentPassword) {
      throw new AccountValidationError('La nueva contraseña debe ser distinta de la actual');
    }

    await deps.accountRepository.changePassword(user.userId, await deps.passwordHasher.hash(input.newPassword));
    return { success: true, message: 'Contraseña actualizada correctamente' };
  };
