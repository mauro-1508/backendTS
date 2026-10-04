/** Roles que iam siembra al crear su base de datos. */
export const ROLE_NAMES = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

/** Rol que recibe toda cuenta nueva (registro propio o Google). */
export const DEFAULT_ROLE = ROLE_NAMES.USER;
