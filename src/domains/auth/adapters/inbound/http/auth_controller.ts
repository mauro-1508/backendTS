import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../../../ports/inbound/auth_service';
import { AuthError, EmailAlreadyExistsError } from '../../../domain/service';
import { InvalidUserDataError } from '../../../../users/domain/service';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  resendVerificationBodySchema,
  verifyEmailBodySchema,
  verifyCodeBodySchema,
} from './dto/auth_request';

const sendAuthError = (res: Response, error: AuthError) =>
  res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });

// Errores de negocio conocidos -> su httpStatus y codigo; cualquier otro va al errorHandler (500 generico).
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof AuthError) return sendAuthError(res, error);
  if (error instanceof InvalidUserDataError) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: error.message });
  }
  return next(error);
};

// Carrera de registro: el UNIQUE de users.email (23505) equivale a correo ya registrado.
const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; constraint?: string } | null;
  return e?.code === '23505' && e.constraint === 'users_email_key';
};

const INVALID_BODY_MESSAGE = 'Datos de solicitud inválidos';

export const makeAuthController = (authService: AuthService) => {
  // Valida el body (puede ser undefined en Express 5); si falla responde 400 y devuelve null.
  const parse = <T extends z.ZodType>(schema: T, req: Request, res: Response): z.infer<T> | null => {
    const parsed = schema.safeParse(req.body ?? {});
    if (parsed.success) return parsed.data;
    res.status(400).json({ success: false, code: 'INVALID_BODY', message: INVALID_BODY_MESSAGE });
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
        return isUniqueViolation(error) ? sendAuthError(res, new EmailAlreadyExistsError()) : handleError(error, res, next);
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

    verifyEmail: async (req: Request, res: Response, next: NextFunction) => {
      const body = parse(verifyEmailBodySchema, req, res);
      if (!body) return;
      try {
        return res.status(200).json(await authService.verifyEmail(body));
      } catch (error) {
        return handleError(error, res, next);
      }
    },

    resendVerification: async (req: Request, res: Response, next: NextFunction) => {
      const body = parse(resendVerificationBodySchema, req, res);
      if (!body) return;
      try {
        return res.status(200).json(await authService.resendVerification(body));
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
