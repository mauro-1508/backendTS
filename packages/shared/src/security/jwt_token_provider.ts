import jwt, { SignOptions } from 'jsonwebtoken';
import { TokenProvider } from './token_provider';

export interface JwtSettings {
  secret: string;
  expiresIn: string;
}

export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'traduce-iam';
export const JWT_AUDIENCE = 'traduce-api';

/** Payload actual: `sub` es el id del usuario (string, como exige el estandar JWT). */
interface JwtPayload {
  sub?: string;
  email: string;
  roles?: string[];
}

const toUserId = (payload: JwtPayload): number => {
  const userId = Number(payload.sub);
  if (payload.sub === undefined || !Number.isInteger(userId)) {
    throw new Error('El token no identifica a un usuario');
  }
  return userId;
};

export const makeJwtTokenProvider = (settings: JwtSettings): TokenProvider => {
  const expiresIn = settings.expiresIn as SignOptions['expiresIn'];
  return {
    sign: (user) =>
      jwt.sign({ email: user.email, roles: user.roles }, settings.secret, {
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn,
        subject: String(user.userId),
      }),

    verify: (token) => {
      const payload = jwt.verify(token, settings.secret, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as JwtPayload;
      return { userId: toUserId(payload), email: payload.email, roles: payload.roles ?? [] };
    },
  };
};
