import { TokenProvider } from '../ports/outbound/auth_provider';
import { RoleReader } from '../ports/outbound/role_reader';

/** Firma el JWT con los roles y permisos que la cuenta tiene hoy en iam. */
export const signSession = async (
  deps: { tokenProvider: TokenProvider; roleReader: RoleReader },
  user: { userId: number; email: string },
): Promise<string> => {
  const { roles, permissions } = await deps.roleReader.readAccess(user.userId);
  return deps.tokenProvider.sign({ userId: user.userId, email: user.email, roles, permissions });
};
