import { Role } from './entity';
import { RevokeOutcome } from './service';

export interface IamRepository {
  findRoleByName(name: string): Promise<Role | null>;
  findRoleById(roleId: number): Promise<Role | null>;
  listRoles(): Promise<Role[]>;
  listRolesForUser(userId: number): Promise<Role[]>;
  listPermissionsForUser(userId: number): Promise<string[]>;
  userExists(userId: number): Promise<boolean>;
  /** Idempotente: asignar un rol que ya se tiene no es error. */
  assignRole(params: { userId: number; roleId: number }): Promise<void>;
  /** Comprueba invariantes (decideRevoke) y borra en una sola transaccion con bloqueo de filas. */
  revokeRoleGuarded(params: { userId: number; roleId: number; isAdminRole: boolean }): Promise<RevokeOutcome>;
  /** true si el usuario es ADMIN y es el unico que queda con ese rol. */
  isLastAdmin(userId: number): Promise<boolean>;
  countUsersWithRole(roleId: number): Promise<number>;
  deleteRole(roleId: number): Promise<void>;
}
