import { NextFunction, Request, Response } from 'express';
import { AuthenticatedUser, TokenProvider } from '../security/token_provider';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const BEARER_PREFIX = 'Bearer ';

export const makeAuthMiddleware = (tokenProvider: TokenProvider) =>
  (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Formato de token inválido' });
      return;
    }

    try {
      req.user = tokenProvider.verify(authHeader.slice(BEARER_PREFIX.length));
      next();
    } catch {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Token inválido' });
    }
  };
