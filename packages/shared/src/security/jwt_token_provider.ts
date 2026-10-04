import jwt, { SignOptions } from 'jsonwebtoken';
import { TokenProvider } from './token_provider';

export interface JwtSettings {
  secret: string;
  expiresIn: string;
}

/** Payload actual: `sub` es el id del usuario (string, como exige el estandar JWT). */
interface JwtPayload {
  sub?: string;
  /** Payload anterior a los microservicios; se sigue aceptando para no invalidar tokens. */
  user_id?: number;
  email: string;
  roles?: string[];
}

const toUserId = (payload: JwtPayload): number => {
  const userId = payload.sub !== undefined ? Number(payload.sub) : payload.user_id;
  if (userId === undefined || !Number.isInteger(userId)) {
    throw new Error('El token no identifica a un usuario');
  }
  return userId;
};

export const makeJwtTokenProvider = (settings: JwtSettings): TokenProvider => {
  const expiresIn = settings.expiresIn as SignOptions['expiresIn'];
  return {
    sign: (user) =>
      jwt.sign({ email: user.email, roles: user.roles }, settings.secret, {
        expiresIn,
        subject: String(user.userId),
      }),

    verify: (token) => {
      const payload = jwt.verify(token, settings.secret) as JwtPayload;
      return { userId: toUserId(payload), email: payload.email, roles: payload.roles ?? [] };
    },
  };
};
