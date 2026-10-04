import { TokenProvider } from '@traduce/shared';
import { RoleRepository } from '../../users/ports/outbound/role_repository';
import { User } from '../../users/domain/entity';

/** Firma el JWT del usuario con los roles que tiene hoy en la base de iam. */
export const makeIssueToken = (deps: { tokenProvider: TokenProvider; roleRepository: RoleRepository }) =>
  async (user: Pick<User, 'userId' | 'email'>): Promise<string> => {
    const roles = await deps.roleRepository.findRoleNamesByUserId(user.userId);
    return deps.tokenProvider.sign({ userId: user.userId, email: user.email, roles });
  };

export type IssueToken = ReturnType<typeof makeIssueToken>;
