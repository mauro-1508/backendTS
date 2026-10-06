import { UserRepository } from '../ports/outbound/user_repository';
import { AccountRepository } from '../ports/outbound/account_repository';
import { PasswordHasher } from '../ports/outbound/password_hasher';
import { AdminGuard } from '../ports/outbound/admin_guard';
import { AccountNotFoundError, InvalidPasswordError, LastAdminAccountError } from '../domain/service';
import { AccountResult } from '../ports/inbound/user_service';

export const makeDeleteAccount = (deps: {
  userRepository: UserRepository;
  accountRepository: AccountRepository;
  passwordHasher: PasswordHasher;
  adminGuard: AdminGuard;
}) =>
  async (input: { userId: number; password: string }): Promise<AccountResult> => {
    const user = await deps.userRepository.findById(input.userId);
    if (!user) throw new AccountNotFoundError();
    if (!user.password || !(await deps.passwordHasher.compare(input.password, user.password))) {
      throw new InvalidPasswordError();
    }
    if (await deps.adminGuard.isLastAdmin(user.userId)) throw new LastAdminAccountError();

    // El adaptador vuelve a comprobar bajo bloqueo: cubre la carrera con una revocacion concurrente.
    // TODO(deuda): emitir UserDeleted cuando exista el bus; lexicon-service guarda created_by/updated_by sin FK.
    const outcome = await deps.accountRepository.erase(user.userId);
    if (outcome === 'last_admin') throw new LastAdminAccountError();
    if (outcome === 'not_found') throw new AccountNotFoundError();
    return { success: true, message: 'Cuenta eliminada correctamente' };
  };
