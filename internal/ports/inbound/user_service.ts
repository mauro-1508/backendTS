import { User } from '../../domain/user/entity';

export interface UserService {
  getById(userId: number): Promise<User | null>;
}
