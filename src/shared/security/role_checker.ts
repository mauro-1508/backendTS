/** Puerto: ¿el usuario tiene este rol? */
export interface RoleChecker {
  hasRole(userId: number, roleName: string): Promise<boolean>;
}
