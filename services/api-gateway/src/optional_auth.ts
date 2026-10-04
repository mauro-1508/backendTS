import { NextFunction, Request, Response } from 'express';
import { TokenProvider } from '@traduce/shared';
import { matchesAnyPrefix, PUBLIC_PREFIXES } from './route_table';

const BEARER_PREFIX = 'Bearer ';

/**
 * Valida el JWT solo si viene: sin cabecera la peticion pasa (cada servicio
 * decide que rutas exigen sesion). Un token presente pero invalido se corta aqui.
 */
export const makeOptionalAuth = (tokenProvider: TokenProvider) =>
  (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX) || matchesAnyPrefix(req.path, PUBLIC_PREFIXES)) {
      next();
      return;
    }
    try {
      tokenProvider.verify(header.slice(BEARER_PREFIX.length));
      next();
    } catch {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Token inválido' });
    }
  };
