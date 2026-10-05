import { NextFunction, Request, RequestHandler, Response } from 'express';
import { PermissionChecker } from '../../../ports/outbound/permission_checker';

/** Va despues de authMiddleware: 401 si no hay usuario, 403 si no tiene el permiso. */
export const makeRequirePermission = (checker: PermissionChecker) =>
  (permission: string): RequestHandler =>
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req.user as { userId?: number } | undefined)?.userId;
      if (userId === undefined) {
        res.status(401).json({ success: false, message: 'No autenticado' });
        return;
      }
      try {
        if (!(await checker.hasPermission(userId, permission))) {
          res.status(403).json({ success: false, message: 'Permiso insuficiente' });
          return;
        }
      } catch {
        res.status(500).json({ success: false, message: 'Error interno' });
        return;
      }
      next();
    };
