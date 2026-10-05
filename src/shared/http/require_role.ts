import { NextFunction, Request, Response } from 'express';
import { RoleChecker } from '../security/role_checker';

/** Va DESPUÉS de authMiddleware: usa `req.user.userId`. */
export const makeRequireRole = (roleChecker: RoleChecker) =>
  (roleName: string) =>
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?.userId;
      try {
        if (userId !== undefined && await roleChecker.hasRole(userId, roleName)) {
          next();
          return;
        }
        res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'No tienes permiso para realizar esta acción',
        });
      } catch (error) {
        console.error('[require_role]', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
      }
    };
