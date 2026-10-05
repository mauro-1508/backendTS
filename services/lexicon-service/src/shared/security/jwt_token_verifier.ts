import jwt from 'jsonwebtoken';
import { AuthenticatedUser, TokenVerifier } from './token_verifier';

export const JWT_ALGORITHM = 'HS256';

/**
 * Acepta el payload actual de iam (`user_id`) y el estandar (`sub`);
 * `roles` es opcional hasta que iam lo incluya.
 */
interface JwtPayload {
  sub?: string | number;
  user_id?: string | number;
  email?: string;
  roles?: unknown;
}

const toUserId = (payload: JwtPayload): number => {
  const userId = Number(payload.sub ?? payload.user_id);
  if (!Number.isInteger(userId)) {
    throw new Error('El token no identifica a un usuario');
  }
  return userId;
};

const toRoles = (roles: unknown): string[] =>
  Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : [];

export const makeJwtTokenVerifier = (secret: string): TokenVerifier => ({
  verify: (token) => {
    const payload = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] }) as JwtPayload;
    return { userId: toUserId(payload), email: payload.email ?? '', roles: toRoles(payload.roles) };
  },
});
