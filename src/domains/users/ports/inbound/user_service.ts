import { UserStats } from '../../domain/stats';
import { User } from '../../domain/entity';

export interface UserService {
  getById(userId: number): Promise<User | null>;
  getStats(input: { userId: number }): Promise<UserStats>;
}
