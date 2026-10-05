/** Puerto propio de ia: quien lo cablea decide de donde salen los permisos. */
export interface PermissionChecker {
  hasPermission(userId: number, permission: string): Promise<boolean>;
}
