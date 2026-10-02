import { Role, ROLE_NAMES } from './entity';

export class PermissionDeniedError extends Error {}
export class RoleInUseError extends Error {}
export class RoleNotFoundError extends Error {}
export class UserNotFoundError extends Error {}
export class InvalidIamInputError extends Error {}
export class LastAdminError extends Error {}
export class UserWithoutRoleError extends Error {}
export class ProtectedRoleError extends Error {}

export type RevokeOutcome = 'revoked' | 'not_assigned' | 'last_admin' | 'last_role';

export const iamDomainService = {
  /** Union sin duplicados de los permisos de todos los roles. */
  effectivePermissions(roles: Role[]): string[] {
    return [...new Set(roles.flatMap((role) => role.permissions))];
  },

  ensureHasPermission(granted: string[], required: string): void {
    if (!granted.includes(required)) {
      throw new PermissionDeniedError('Permiso insuficiente');
    }
  },

  /** INV-017: un rol en uso no se puede eliminar. */
  ensureCanDelete(usersWithRole: number): void {
    if (usersWithRole > 0) {
      throw new RoleInUseError('El rol esta asignado a usuarios');
    }
  },

  /** Los roles del seed son la base del RBAC y no se eliminan. */
  ensureNotProtected(roleName: string): void {
    if ((ROLE_NAMES as readonly string[]).includes(roleName)) {
      throw new ProtectedRoleError('Rol protegido');
    }
  },

  /** Invariantes de revocacion: siempre queda un ADMIN y todo usuario conserva al menos un rol. */
  decideRevoke(s: { hasRole: boolean; isAdminRole: boolean; adminCount: number; userRoleCount: number }): RevokeOutcome {
    if (!s.hasRole) return 'not_assigned';
    if (s.isAdminRole && s.adminCount <= 1) return 'last_admin';
    if (s.userRoleCount <= 1) return 'last_role';
    return 'revoked';
  },

  ensureValidId(value: unknown, field: string): void {
    if (!Number.isInteger(value) || (value as number) <= 0) {
      throw new InvalidIamInputError(`${field} invalido`);
    }
  },

  ensureValidRoleName(roleName: unknown): void {
    if (typeof roleName !== 'string' || !roleName.trim()) {
      throw new InvalidIamInputError('roleName invalido');
    }
  },
};
