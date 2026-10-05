import { AuthenticatedUser } from './token_verifier';

export interface RoleDecision {
  allowed: boolean;
  /** Mensaje para el cliente cuando se deniega. */
  reason?: string;
}

/** Puerto: ¿el usuario autenticado tiene este rol? */
export interface RoleChecker {
  check(user: AuthenticatedUser, roleName: string): Promise<RoleDecision>;
}
