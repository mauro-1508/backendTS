export class PermissionDeniedError extends Error {}

export interface UserStats {
  totalUsers: number;
  activeAccounts: number; // status = 'ACTIVE'
}
