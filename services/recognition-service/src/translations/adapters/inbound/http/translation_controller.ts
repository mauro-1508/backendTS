import { Request, Response } from 'express';
import { TranslationService } from '../../../ports/inbound/translation_service';

/** El user_id sale solo del JWT verificado por authMiddleware (req.user); nunca del cuerpo ni de la query. */
const resolveUserId = (req: Request): number => req.user!.userId;

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
      const result = await translationService.remove({ translationId, userId });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },
});
