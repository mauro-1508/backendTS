import { UserStats } from '../../domain/stats';
import { User } from '../../domain/entity';

export interface AccountResult {
  success: boolean;
  message: string;
}

export interface UserService {
  getById(userId: number): Promise<User | null>;
  getStats(input: { userId: number }): Promise<UserStats>;
  /** Ids de los admins activos (solo para tokens de servicio con admins.read). */
  listAdminIds(): Promise<number[]>;
  changePassword(input: { userId: number; currentPassword: string; newPassword: string }): Promise<AccountResult>;
  /** Con contraseña se confirma con ella; sin contraseña (Google), con el codigo de sendDeletionCode. */
  deleteAccount(input: { userId: number; password?: string; code?: string }): Promise<AccountResult>;
  sendDeletionCode(input: { userId: number }): Promise<AccountResult>;
}
