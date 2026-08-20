import { NextFunction, Request, Response } from 'express';
import { TokenProvider } from '../../../../ports/outbound/auth_provider';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { userId: number; email: string };
    }
  }
}

export const makeAuthMiddleware = (tokenProvider: TokenProvider) =>
  (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Formato de token inválido' });
      return;
    }

    const token = authHeader.split(' ')[1];

    try {
      req.user = tokenProvider.verify(token);
      next();
    } catch {
      res.status(401).json({ message: 'Token inválido' });
    }
  };
