export const ROLE_NAMES = ['USER', 'LINGUIST', 'ADMIN'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const DEFAULT_ROLE: RoleName = 'USER';

// Los nombres de permiso son compartidos: los demas servicios los leen del JWT.
export { PERMISSIONS } from '@traduce/shared';
export type { PermissionName } from '@traduce/shared';

export interface Permission {
  permissionId: number;
  name: string;
  description: string | null;
}

export interface Role {
  roleId: number;
  name: string;
  description: string | null;
  // Nombres de los permisos concedidos al rol (INV-016: solo se llega a ellos por rol).
  permissions: string[];
}
