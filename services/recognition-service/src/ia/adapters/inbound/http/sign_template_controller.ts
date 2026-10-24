import { NextFunction, Request, Response } from 'express';
import { AccountErasedError } from '../../../../common/domain/errors';
import { NewSignTemplate } from '../../../domain/entity';
import { InvalidSignTemplateError, SignTemplateNotFoundError } from '../../../domain/service';
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
  throw new InvalidSignTemplateError('Se espera "gestures" o "templates" en el cuerpo');
};

/**
 * `req.user` lo llena authMiddleware. Se lee con un cast explicito porque los
 * tipos de passport declaran otro `Express.User` y tapan la ampliacion nuestra
 * cuando este archivo se compila suelto.
 */
const userIdOf = (req: Request): number | null =>
  (req.user as { userId?: number } | undefined)?.userId ?? null;

// Errores de negocio conocidos -> su status y codigo; cualquier otro va al errorHandler (500 generico, sin el detalle interno).
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof AccountErasedError) {
    return res.status(401).json({ success: false, code: 'ACCOUNT_DELETED', message: error.message });
  }
  if (error instanceof InvalidSignTemplateError) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: error.message });
  }
  if (error instanceof SignTemplateNotFoundError) {
    return res.status(404).json({ success: false, code: 'NOT_FOUND', message: error.message });
  }
  return next(error);
};

export const makeSignTemplateController = (service: SignTemplateService) => ({
  import: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importedIds = await service.importMany({
        templates: toTemplates(req.body ?? {}),
        userId: userIdOf(req),
      });
      return res.status(201).json({ success: true, message: `${importedIds.length} plantillas importadas`, data: importedIds });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { kind, label } = req.query;
      const templates = await service.list({ kind: kind as string | undefined, label: label as string | undefined });
      return res.status(200).json({ success: true, data: templates });
    } catch (error) {
      return handleError(error, res, next);
    }
  },

  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const removed = await service.remove({ templateId: Number(req.params.id), userId: userIdOf(req) });
      return res.status(200).json({ success: true, message: 'Plantilla eliminada', data: removed });
    } catch (error) {
      return handleError(error, res, next);
    }
  },
});
