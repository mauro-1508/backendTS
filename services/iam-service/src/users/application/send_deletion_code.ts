import { UserRepository } from '../ports/outbound/user_repository';
import { DeletionCodes } from '../ports/outbound/deletion_codes';
import { AccountNotFoundError, DeletionCodeLimitError, PasswordAccountError } from '../domain/service';
import { AccountResult } from '../ports/inbound/user_service';

/** Envia al correo de la cuenta el codigo que confirma su borrado. Solo para cuentas sin contraseña. */
export const makeSendDeletionCode = (deps: { userRepository: UserRepository; deletionCodes: DeletionCodes }) =>
  async (input: { userId: number }): Promise<AccountResult> => {
    const user = await deps.userRepository.findById(input.userId);
    if (!user) throw new AccountNotFoundError();
    if (user.password) throw new PasswordAccountError();

    const result = await deps.deletionCodes.send({ userId: user.userId, email: user.email, name: user.name });
    if (result !== 'issued') throw new DeletionCodeLimitError(result);
    return { success: true, message: 'Te enviamos un código a tu correo' };
  };
