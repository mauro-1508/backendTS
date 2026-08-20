import { UserRepository } from '../../ports/outbound/user_repository';
import { User } from '../../domain/user/entity';

export const makeGetUser = (deps: { userRepository: UserRepository }) =>
  async (userId: number): Promise<User | null> => {
    return deps.userRepository.findById(userId);
  };
