import { IamRepository } from '../ports/outbound/iam_repository';
import { IamResult } from '../ports/inbound/iam_service';
import { PERMISSIONS } from '../domain/entity';
import { iamDomainService, RoleNotFoundError, UserNotFoundError } from '../domain/service';

export const makeAssignRole = (deps: { iamRepository: IamRepository }) =>
  async ({ actorId, userId, roleName }: { actorId: number; userId: number; roleName: string }): Promise<IamResult> => {
    const granted = await deps.iamRepository.listPermissionsForUser(actorId);
    iamDomainService.ensureHasPermission(granted, PERMISSIONS.USERS_MANAGE);
    iamDomainService.ensureValidId(userId, 'userId');
    iamDomainService.ensureValidRoleName(roleName);

    const role = await deps.iamRepository.findRoleByName(roleName.trim());
    if (!role) throw new RoleNotFoundError('Rol no encontrado');
    if (!(await deps.iamRepository.userExists(userId))) throw new UserNotFoundError('Usuario no encontrado');

    // TODO(deuda): emitir RoleAssigned (domain-events.md) cuando exista el bus de eventos.
    await deps.iamRepository.assignRole({ userId, roleId: role.roleId });
    return { success: true, message: 'Rol asignado' };
  };
