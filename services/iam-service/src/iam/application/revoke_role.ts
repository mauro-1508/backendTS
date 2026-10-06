import { IamRepository } from '../ports/outbound/iam_repository';
import { IamResult } from '../ports/inbound/iam_service';
import { PERMISSIONS } from '../domain/entity';
import { iamDomainService, LastAdminError, RoleNotFoundError, UserWithoutRoleError } from '../domain/service';

export const makeRevokeRole = (deps: { iamRepository: IamRepository }) =>
  async ({ actorId, userId, roleName }: { actorId: number; userId: number; roleName: string }): Promise<IamResult> => {
    const granted = await deps.iamRepository.listPermissionsForUser(actorId);
    iamDomainService.ensureHasPermission(granted, PERMISSIONS.USERS_MANAGE);
    iamDomainService.ensureValidId(userId, 'userId');
    iamDomainService.ensureValidRoleName(roleName);

    const role = await deps.iamRepository.findRoleByName(roleName.trim());
    if (!role) throw new RoleNotFoundError('Rol no encontrado');

    // TODO(deuda): emitir RoleRevoked (domain-events.md) cuando exista el bus de eventos.
    const outcome = await deps.iamRepository.revokeRoleGuarded({
      userId,
      roleId: role.roleId,
      isAdminRole: role.name === 'ADMIN',
    });
    if (outcome === 'not_assigned') throw new RoleNotFoundError('El usuario no tiene ese rol');
    if (outcome === 'last_admin') throw new LastAdminError('No se puede revocar al ultimo ADMIN');
    if (outcome === 'last_role') throw new UserWithoutRoleError('El usuario no puede quedar sin roles');
    return { success: true, message: 'Rol revocado' };
  };
