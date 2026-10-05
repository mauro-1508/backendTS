import { IamRepository } from '../ports/outbound/iam_repository';
import { iamDomainService } from '../domain/service';

export const makeIsLastAdmin = (deps: { iamRepository: IamRepository }) =>
  async (userId: number): Promise<boolean> => {
    iamDomainService.ensureValidId(userId, 'userId');
    return deps.iamRepository.isLastAdmin(userId);
  };
