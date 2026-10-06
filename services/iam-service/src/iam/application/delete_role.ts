import { IamRepository } from '../ports/outbound/iam_repository';
import { IamResult } from '../ports/inbound/iam_service';
import { PERMISSIONS } from '../domain/entity';
import { iamDomainService, RoleNotFoundError } from '../domain/service';

export const makeDeleteRole = (deps: { iamRepository: IamRepository }) =>
  async ({ actorId, roleId }: { actorId: number; roleId: number }): Promise<IamResult> => {
    const granted = await deps.iamRepository.listPermissionsForUser(actorId);
    iamDomainService.ensureHasPermission(granted, PERMISSIONS.USERS_MANAGE);
    iamDomainService.ensureValidId(roleId, 'roleId');

    const role = await deps.iamRepository.findRoleById(roleId);
    if (!role) throw new RoleNotFoundError('Rol no encontrado');

    iamDomainService.ensureNotProtected(role.name);
    iamDomainService.ensureCanDelete(await deps.iamRepository.countUsersWithRole(roleId));
    await deps.iamRepository.deleteRole(roleId);
    return { success: true, message: 'Rol eliminado' };
  };
