export interface IamResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface IamService {
  hasPermission(userId: number, permission: string): Promise<boolean>;
  getMyAccess(input: { userId: number }): Promise<IamResult>;
  listRoles(input: { actorId: number }): Promise<IamResult>;
  assignRole(input: { actorId: number; userId: number; roleName: string }): Promise<IamResult>;
  revokeRole(input: { actorId: number; userId: number; roleName: string }): Promise<IamResult>;
  deleteRole(input: { actorId: number; roleId: number }): Promise<IamResult>;
  /** Asigna el rol USER (idempotente); lo usa el registro de cuentas. */
  assignDefaultRole(userId: number): Promise<void>;
  /** true si el usuario es el unico ADMIN (no puede darse de baja ni quedarse sin el rol). */
  isLastAdmin(userId: number): Promise<boolean>;
}
