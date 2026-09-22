import jwt, { SignOptions } from 'jsonwebtoken';
import { TokenPayload, TokenProvider } from '../../../ports/outbound/auth_provider';
import { config } from '../../../../config/config';

const signOptions: SignOptions = { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] };

export const jwtTokenProvider: TokenProvider = {
  sign: (payload: TokenPayload) =>
    jwt.sign({ user_id: payload.userId, email: payload.email }, config.jwt.secret, signOptions),

  verify: (token: string): TokenPayload => {
    const decoded = jwt.verify(token, config.jwt.secret) as { user_id: number; email: string };
    return { userId: decoded.user_id, email: decoded.email };
  },
};
