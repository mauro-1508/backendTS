import { NextFunction, Request, Response } from 'express';

/**
 * Va DESPUES de authMiddleware. Los permisos viajan en el token (`permissions`),
 * asi que ningun servicio necesita consultar la base de iam.
 */
export const requirePermission = (permission: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.permissions?.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'No tienes permiso para realizar esta acción',
    });
  };
