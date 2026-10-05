import { RoleSource } from '../config/env';
import { jwtRoleChecker } from './jwt_role_checker';
import { noRolesChecker } from './no_roles_checker';
import { RoleChecker } from './role_checker';

const ROLE_CHECKERS: Record<RoleSource, RoleChecker> = {
  jwt: jwtRoleChecker,
  none: noRolesChecker,
};

/** Para añadir una fuente nueva basta con registrarla en ROLE_CHECKERS. */
export const makeRoleChecker = (source: RoleSource): RoleChecker => ROLE_CHECKERS[source];
