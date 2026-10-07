import { UserStats } from '../../domain/stats';
import { User } from '../../domain/entity';

export interface AccountResult {
  success: boolean;
  message: string;
}

export interface UserService {
  getById(userId: number): Promise<User | null>;
  getStats(input: { userId: number }): Promise<UserStats>;
  changePassword(input: { userId: number; currentPassword: string; newPassword: string }): Promise<AccountResult>;
  deleteAccount(input: { userId: number; password: string }): Promise<AccountResult>;
}
