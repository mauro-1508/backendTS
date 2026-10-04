import { NextFunction, Request, Response } from 'express';

/**
 * Va DESPUES de authMiddleware. Los roles viajan en el token (`roles`), asi
 * que ningun servicio necesita consultar la base de usuarios.
 */
export const requireRole = (roleName: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.roles?.includes(roleName)) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'No tienes permiso para realizar esta acción',
    });
  };
