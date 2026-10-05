import { NextFunction, Request, Response } from 'express';
import { PermissionDeniedError } from '../../../domain/stats';
import { UserService } from '../../../ports/inbound/user_service';

export const makeUserController = (userService: UserService) => ({
  stats: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await userService.getStats({ userId: req.user!.userId });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        return res.status(403).json({ success: false, code: 'PERMISSION_ERROR', message: 'Permiso insuficiente' });
      }
      return next(error);
    }
  },

  me: async (req: Request, res: Response) => {
    try {
      const user = await userService.getById(req.user!.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }
      return res.status(200).json({
        success: true,
        data: { user_id: user.userId, name: user.name, email: user.email },
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },
});
