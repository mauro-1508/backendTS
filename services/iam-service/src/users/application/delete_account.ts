import { UserRepository } from '../ports/outbound/user_repository';
import { AccountRepository } from '../ports/outbound/account_repository';
import { PasswordHasher } from '../ports/outbound/password_hasher';
import { AdminGuard } from '../ports/outbound/admin_guard';
import { DeletionCodes } from '../ports/outbound/deletion_codes';
import {
  AccountNotFoundError, InvalidDeletionCodeError, InvalidPasswordError, LastAdminAccountError,
} from '../domain/service';
import { AccountResult } from '../ports/inbound/user_service';

export const makeDeleteAccount = (deps: {
  userRepository: UserRepository;
  accountRepository: AccountRepository;
  passwordHasher: PasswordHasher;
  adminGuard: AdminGuard;
  deletionCodes: DeletionCodes;
}) =>
  async (input: { userId: number; password?: string; code?: string }): Promise<AccountResult> => {
    const user = await deps.userRepository.findById(input.userId);
    if (!user) throw new AccountNotFoundError();
    if (user.password) {
      // Cuenta con contraseña: se confirma con ella (un codigo no la sustituye).
      if (!input.password || !(await deps.passwordHasher.compare(input.password, user.password))) {
        throw new InvalidPasswordError();
      }
    } else if (!input.code || !(await deps.deletionCodes.check(user.userId, input.code))) {
      // Cuenta sin contraseña (Google): codigo enviado a su correo con POST /users/me/delete-code.
      throw new InvalidDeletionCodeError();
    }
    if (await deps.adminGuard.isLastAdmin(user.userId)) throw new LastAdminAccountError();

    // El adaptador vuelve a comprobar bajo bloqueo: cubre la carrera con una revocacion concurrente.
    // erase() deja iam.UserDeleted en el outbox (misma transaccion); el relay lo publica al broker.
    // lexicon-service conserva created_by/updated_by a proposito (autoria, decision del usuario).
    // erase() tambien borra sus codigos (user_tokens), incluido el de borrado ya usado.
    const outcome = await deps.accountRepository.erase(user.userId);
    if (outcome === 'last_admin') throw new LastAdminAccountError();
    if (outcome === 'not_found') throw new AccountNotFoundError();
    return { success: true, message: 'Cuenta eliminada correctamente' };
  };
