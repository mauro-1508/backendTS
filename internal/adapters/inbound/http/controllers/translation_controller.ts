import { Request, Response } from 'express';
import { TranslationService } from '../../../../ports/inbound/translation_service';

/**
 * El user_id sale del JWT verificado por authMiddleware (req.user).
 * Se mantiene el fallback a body/query solo para pruebas manuales con
 * herramientas tipo curl/Postman.
 */
const resolveUserId = (req: Request): number | null => {
  if (req.user?.userId) return req.user.userId;
  if (req.body?.user_id) return Number(req.body.user_id);
  if (req.query?.user_id) return Number(req.query.user_id);
  return null;
};

export const makeTranslationController = (translationService: TranslationService) => ({
  create: async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req);
      const { inputText, outputText, type, confidence, source } = req.body;
      const result = await translationService.create({ userId, inputText, outputText, type, confidence, source });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req);
      const { limit, offset } = req.query;
      const result = await translationService.list({
        userId,
        limit: limit as string | undefined,
        offset: offset as string | undefined,
      });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const userId = resolveUserId(req);
      const translationId = Number(req.params.id);
      const result = await translationService.remove({ translationId, userId: userId as number });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },
});
