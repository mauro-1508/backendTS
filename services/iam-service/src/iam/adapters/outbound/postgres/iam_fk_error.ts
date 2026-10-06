import { RoleNotFoundError, UserNotFoundError } from '../../../domain/service';

// Nombres de las FK de user_roles (migrations/003_iam_roles_permissions.sql).
export const FK_USER_ROLES_USER = 'fk_user_roles_user';
export const FK_USER_ROLES_ROLE = 'fk_user_roles_role';

// Traduce una violacion 23503 al insertar en user_roles; null si no es una FK conocida.
export const translateAssignRoleFkError = (error: unknown): Error | null => {
  const { code, constraint } = (error ?? {}) as { code?: string; constraint?: string };
  if (code !== '23503') return null;
  if (constraint === FK_USER_ROLES_ROLE) return new RoleNotFoundError('Rol no encontrado');
  if (constraint === FK_USER_ROLES_USER) return new UserNotFoundError('Usuario no encontrado');
  return null;
};
