import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { IamService } from '../../../ports/inbound/iam_service';
import {
  InvalidIamInputError,
  LastAdminError,
  PermissionDeniedError,
  ProtectedRoleError,
  RoleInUseError,
  RoleNotFoundError,
  UserNotFoundError,
  UserWithoutRoleError,
} from '../../../domain/service';
import { assignRoleBodySchema, roleParamsSchema, userParamsSchema, userRoleParamsSchema } from './dto/iam_request';

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, code, message });

// Errores de dominio -> HTTP con mensaje generico; el resto va al errorHandler (500).
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof z.ZodError || error instanceof InvalidIamInputError) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Solicitud invalida');
  }
  if (error instanceof PermissionDeniedError) return fail(res, 403, 'PERMISSION_ERROR', 'Permiso insuficiente');
  if (error instanceof RoleInUseError) return fail(res, 409, 'ROLE_IN_USE', 'El rol esta en uso');
  if (error instanceof LastAdminError) return fail(res, 409, 'LAST_ADMIN', 'No se puede revocar al ultimo ADMIN');
  if (error instanceof UserWithoutRoleError) return fail(res, 409, 'ROLE_REQUIRED', 'El usuario debe conservar un rol');
  if (error instanceof ProtectedRoleError) return fail(res, 409, 'ROLE_PROTECTED', 'El rol esta protegido');
  if (error instanceof RoleNotFoundError || error instanceof UserNotFoundError) {
    return fail(res, 404, 'NOT_FOUND', 'Recurso no encontrado');
  }
  return next(error);
};

// El actor sale siempre del JWT (req.user); nunca de body/query/params.
export const makeIamController = (iamService: IamService) => ({
  myAccess: async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.status(200).json(await iamService.getMyAccess({ userId: req.user!.userId }));
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  listRoles: async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.status(200).json(await iamService.listRoles({ actorId: req.user!.userId }));
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  assignRole: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = userParamsSchema.parse(req.params);
      const { roleName } = assignRoleBodySchema.parse(req.body);
      const result = await iamService.assignRole({ actorId: req.user!.userId, userId, roleName });
      return res.status(200).json(result);
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  revokeRole: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, roleName } = userRoleParamsSchema.parse(req.params);
      const result = await iamService.revokeRole({ actorId: req.user!.userId, userId, roleName });
      return res.status(200).json(result);
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  deleteRole: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { roleId } = roleParamsSchema.parse(req.params);
      return res.status(200).json(await iamService.deleteRole({ actorId: req.user!.userId, roleId }));
    } catch (error) {
      return handleError(error, res, next);
    }
  },
});
