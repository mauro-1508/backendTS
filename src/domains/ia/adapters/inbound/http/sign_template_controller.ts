import { Request, Response } from 'express';
import { NewSignTemplate } from '../../../domain/entity';
import { SignTemplateService } from '../../../ports/inbound/sign_template_service';
import { ImportTemplatesRequestDto } from './dto/import_templates_request';

/**
 * Acepta los dos formatos: el `{ gestures: [{ label, frames }] }` que exporta
 * la app (y produce el conversor del dataset) y el explicito
 * `{ templates: [{ label, kind, features }] }`.
 */
const toTemplates = (body: ImportTemplatesRequestDto): NewSignTemplate[] => {
  if (Array.isArray(body.templates)) return body.templates;
  if (Array.isArray(body.gestures)) {
    return body.gestures.map(g => ({
      label: g.label,
      kind: body.kind ?? 'motion',
      features: g.frames,
      source: body.source ?? 'lsc54',
    }));
  }
  throw new Error('Se espera "gestures" o "templates" en el cuerpo');
};

/**
 * `req.user` lo llena authMiddleware. Se lee con un cast explicito porque los
 * tipos de passport declaran otro `Express.User` y tapan la ampliacion nuestra
 * cuando este archivo se compila suelto.
 */
const userIdOf = (req: Request): number | null =>
  (req.user as { userId?: number } | undefined)?.userId ?? null;

export const makeSignTemplateController = (service: SignTemplateService) => ({
  import: async (req: Request, res: Response) => {
    try {
      const result = await service.importMany({
        templates: toTemplates(req.body ?? {}),
        userId: userIdOf(req),
      });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const { kind, label } = req.query;
      const result = await service.list({ kind: kind as string | undefined, label: label as string | undefined });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },

  remove: async (req: Request, res: Response) => {
    try {
      const result = await service.remove({ templateId: Number(req.params.id) });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: (error as Error).message });
    }
  },
});
