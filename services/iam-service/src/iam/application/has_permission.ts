import { IamRepository } from '../ports/outbound/iam_repository';

export const makeHasPermission = (deps: { iamRepository: IamRepository }) =>
  async (userId: number, permission: string): Promise<boolean> => {
    const granted = await deps.iamRepository.listPermissionsForUser(userId);
    return granted.includes(permission);
  };
