import { NextFunction, Request, Response } from 'express';
import { RoleChecker, RoleDecision } from '../security/role_checker';
import { FORBIDDEN_MESSAGE } from '../security/jwt_role_checker';

const DENIED: RoleDecision = { allowed: false };

/** Va DESPUÉS de authMiddleware: decide con `req.user` a traves del RoleChecker. */
export const makeRequireRole = (roleChecker: RoleChecker) =>
  (roleName: string) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const decision = req.user ? await roleChecker.check(req.user, roleName) : DENIED;
        if (decision.allowed) {
          next();
          return;
        }
        res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: decision.reason ?? FORBIDDEN_MESSAGE,
        });
      } catch (error) {
        console.error('[require_role]', error);
        res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
      }
    };
