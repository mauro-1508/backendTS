import { NextFunction, Request, Response } from 'express';
import { PermissionDeniedError } from '../../../domain/stats';
import { UserService } from '../../../ports/inbound/user_service';
import { AccountError } from '../../../domain/service';
import { changePasswordBodySchema, deleteAccountBodySchema } from './dto/account_request';

const sendInvalidBody = (res: Response) =>
  res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Datos de solicitud inválidos' });

// Errores de negocio conocidos -> su estado y codigo; el resto va al errorHandler (500 generico).
const handleAccountError = (error: unknown, res: Response, next: NextFunction) =>
  error instanceof AccountError
    ? res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message })
    : next(error);

export const makeUserController = (userService: UserService) => ({
  changePassword: async (req: Request, res: Response, next: NextFunction) => {
    const body = changePasswordBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendInvalidBody(res);
    try {
      return res.status(200).json(await userService.changePassword({ userId: req.user!.userId, ...body.data }));
    } catch (error) {
      return handleAccountError(error, res, next);
    }
  },

  deleteAccount: async (req: Request, res: Response, next: NextFunction) => {
    const body = deleteAccountBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendInvalidBody(res);
    try {
      return res.status(200).json(await userService.deleteAccount({ userId: req.user!.userId, ...body.data }));
    } catch (error) {
      return handleAccountError(error, res, next);
    }
  },

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
