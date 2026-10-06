import { IamRepository } from '../ports/outbound/iam_repository';
import { IamResult } from '../ports/inbound/iam_service';
import { PERMISSIONS } from '../domain/entity';
import { iamDomainService } from '../domain/service';

export const makeListRoles = (deps: { iamRepository: IamRepository }) =>
  async ({ actorId }: { actorId: number }): Promise<IamResult> => {
    const granted = await deps.iamRepository.listPermissionsForUser(actorId);
    iamDomainService.ensureHasPermission(granted, PERMISSIONS.USERS_MANAGE);
    const roles = await deps.iamRepository.listRoles();
    return { success: true, data: roles };
  };
