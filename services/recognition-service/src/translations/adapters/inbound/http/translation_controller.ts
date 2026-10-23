import { NextFunction, Request, Response } from 'express';
import { AccountErasedError } from '../../../../common/domain/errors';
import { InvalidTranslationError, TranslationNotFoundError } from '../../../domain/service';
import { PermissionDeniedError } from '../../../domain/stats';
import { TranslationService } from '../../../ports/inbound/translation_service';

/** El user_id sale solo del JWT verificado por authMiddleware (req.user); nunca del cuerpo ni de la query. */
const resolveUserId = (req: Request): number => req.user!.userId;

// Errores de negocio conocidos -> su status y codigo; cualquier otro va al errorHandler (500 generico, sin el detalle interno).
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  // Cuenta borrada con un JWT todavia vigente: el token ya no corresponde a ninguna cuenta (401).
  if (error instanceof AccountErasedError) {
    return res.status(401).json({ success: false, code: 'ACCOUNT_DELETED', message: error.message });
  }
  if (error instanceof InvalidTranslationError) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: error.message });
  }
  if (error instanceof TranslationNotFoundError) {
    return res.status(404).json({ success: false, code: 'NOT_FOUND', message: error.message });
  }
  return next(error);
};

export const makeTranslationController = (translationService: TranslationService) => ({
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = resolveUserId(req);
      const { inputText, outputText, type, confidence, source, mode, sessionId } = req.body;
      if (mode !== undefined && mode !== 'letters' && mode !== 'words') throw new InvalidTranslationError('mode invalido. Valores permitidos: letters, words');
      if (sessionId !== undefined && (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(sessionId))) throw new InvalidTranslationError('sessionId invalido');
      const created = await translationService.create({ userId, inputText, outputText, type, confidence, source, mode, sessionId,
        eligible: !req.user!.permissions.includes('users.manage') && source !== 'mock' });
      return res.status(201).json({ success: true, message: 'Traduccion guardada', data: created });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = resolveUserId(req);
      const { limit, offset } = req.query;
      const translations = await translationService.list({
        userId,
        limit: limit as string | undefined,
        offset: offset as string | undefined,
      });
      return res.status(200).json({ success: true, data: translations });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  stats: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await translationService.getStats({ userId: req.user!.userId, permissions: req.user!.permissions });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        return res.status(403).json({ success: false, code: 'PERMISSION_ERROR', message: 'Permiso insuficiente' });
      }
      return next(error);
    }
  },

  myStats: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await translationService.getMyStats({ userId: req.user!.userId });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = resolveUserId(req);
      const translationId = Number(req.params.id);
      const removed = await translationService.remove({ translationId, userId });
      return res.status(200).json({ success: true, message: 'Traduccion eliminada', data: removed });
    } catch (error) {
      return handleError(error, res, next);
    }
  },
});
