import { RoleChecker } from './role_checker';

export const NO_ROLE_SOURCE_MESSAGE =
  'Las operaciones de administración están deshabilitadas: el servicio no tiene fuente de roles '
  + '(ROLE_SOURCE=none). Configura ROLE_SOURCE=jwt cuando iam incluya "roles" en el token.';

/** Por defecto: sin fuente de roles confiable, se deniega toda escritura. */
export const noRolesChecker: RoleChecker = {
  check: async () => ({ allowed: false, reason: NO_ROLE_SOURCE_MESSAGE }),
};
