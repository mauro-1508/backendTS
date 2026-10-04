import { User } from '../../domain/entity';

export interface UserService {
  getById(userId: number): Promise<User | null>;
}
