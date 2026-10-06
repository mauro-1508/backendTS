import { IamRepository } from '../ports/outbound/iam_repository';
import { DEFAULT_ROLE } from '../domain/entity';
import { iamDomainService, RoleNotFoundError } from '../domain/service';

export const makeAssignDefaultRole = (deps: { iamRepository: IamRepository }) =>
  async (userId: number): Promise<void> => {
    iamDomainService.ensureValidId(userId, 'userId');
    const role = await deps.iamRepository.findRoleByName(DEFAULT_ROLE);
    // Si el seed no se ejecuto fallamos ruidosamente: una cuenta sin rol no puede hacer nada.
    if (!role) throw new RoleNotFoundError(`Rol ${DEFAULT_ROLE} no sembrado`);
    await deps.iamRepository.assignRole({ userId, roleId: role.roleId });
  };
