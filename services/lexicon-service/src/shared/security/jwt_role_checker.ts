import { RoleChecker } from './role_checker';

export const FORBIDDEN_MESSAGE = 'No tienes permiso para realizar esta acción';

/** Lee los roles del token (`roles`). Es el modo objetivo cuando iam los emita. */
export const jwtRoleChecker: RoleChecker = {
  check: async (user, roleName) =>
    user.roles.includes(roleName) ? { allowed: true } : { allowed: false, reason: FORBIDDEN_MESSAGE },
};
