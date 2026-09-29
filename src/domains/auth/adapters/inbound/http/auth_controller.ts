import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../../../ports/inbound/auth_service';
import { AuthError } from '../../../domain/service';
import { InvalidUserDataError } from '../../../../users/domain/service';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyCodeBodySchema,
} from './dto/auth_request';

// Errores de negocio conocidos -> 400 con su mensaje; cualquier otro va al errorHandler (500 generico).
const handleError = (error: unknown, res: Response, next: NextFunction) =>
  error instanceof AuthError || error instanceof InvalidUserDataError
    ? res.status(400).json({ success: false, message: error.message })
    : next(error);

const INVALID_BODY_MESSAGE = 'Datos de solicitud inválidos';

export const makeAuthController = (authService: AuthService) => {
  // Valida el body (puede ser undefined en Express 5); si falla responde 400 y devuelve null.
  const parse = <T extends z.ZodType>(schema: T, req: Request, res: Response): z.infer<T> | null => {
    const parsed = schema.safeParse(req.body ?? {});
    if (parsed.success) return parsed.data;
    res.status(400).json({ success: false, message: INVALID_BODY_MESSAGE });
    return null;
  };

  return {
    register: async (req: Request, res: Response, next: NextFunction) => {
      const body = parse(registerBodySchema, req, res);
      if (!body) return;
      try {
        const result = await authService.register(body);
        return res.status(201).json(result);
      } catch (error) {
        return handleError(error, res, next);
      }
    },

    login: async (req: Request, res: Response, next: NextFunction) => {
      const body = parse(loginBodySchema, req, res);
      if (!body) return;
      try {
        const result = await authService.login(body);
        return res.status(200).json(result);
      } catch (error) {
        return handleError(error, res, next);
      }
    },

    forgotPassword: async (req: Request, res: Response, next: NextFunction) => {
      const body = parse(forgotPasswordBodySchema, req, res);
      if (!body) return;
      try {
        const result = await authService.forgotPassword(body);
        return res.status(200).json(result);
      } catch (error) {
        return handleError(error, res, next);
      }
    },

    verifyCode: async (req: Request, res: Response, next: NextFunction) => {
      const body = parse(verifyCodeBodySchema, req, res);
      if (!body) return;
      try {
        const result = await authService.verifyCode(body);
        return res.status(200).json(result);
      } catch (error) {
        return handleError(error, res, next);
      }
    },

    resetPassword: async (req: Request, res: Response, next: NextFunction) => {
      const body = parse(resetPasswordBodySchema, req, res);
      if (!body) return;
      try {
        const result = await authService.resetPassword(body);
        return res.status(200).json(result);
      } catch (error) {
        return handleError(error, res, next);
      }
    },
  };
};
