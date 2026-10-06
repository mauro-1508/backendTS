import { IamRepository } from '../ports/outbound/iam_repository';
import { IamResult } from '../ports/inbound/iam_service';
import { iamDomainService } from '../domain/service';

export const makeGetMyAccess = (deps: { iamRepository: IamRepository }) =>
  async ({ userId }: { userId: number }): Promise<IamResult> => {
    iamDomainService.ensureValidId(userId, 'userId');
    const roles = await deps.iamRepository.listRolesForUser(userId);
    return {
      success: true,
      data: {
        roles: roles.map((role) => role.name),
        permissions: iamDomainService.effectivePermissions(roles),
      },
    };
  };
