import { Request, Response } from 'express';
import { MultimediaResource, Sign } from '../../../domain/entity';
import { LexiconError } from '../../../domain/rules';
import { LexiconResult, LexiconService } from '../../../ports/inbound/lexicon_service';
import {
  AddResourceRequestDto, CategoryRequestDto, CreateSignRequestDto, LocalizationRequestDto, UpdateSignRequestDto,
} from './dto/sign_request';

/** Ver el comentario equivalente en ia/sign_template_controller.ts. */
const userIdOf = (req: Request): number | null =>
  (req.user as { userId?: number } | undefined)?.userId ?? null;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

/**
 * En la base los recursos guardan rutas relativas al directorio de medios
 * (`alfabeto/glb/A.glb`). Aqui se vuelven URL absolutas para que el cliente
 * no tenga que saber donde estan servidos. `LEXICON_MEDIA_BASE_URL` permite
 * apuntarlas a un CDN.
 */
const mediaBase = (req: Request): string =>
  process.env.LEXICON_MEDIA_BASE_URL?.replace(/\/$/, '')
  || `${req.protocol}://${req.get('host')}${req.baseUrl}/media`;

const withAbsoluteUrls = (req: Request, data: unknown): unknown => {
  const base = mediaBase(req);
  const fix = (r: MultimediaResource): MultimediaResource =>
    /^https:\/\//i.test(r.url) ? r : { ...r, url: `${base}/${r.url.replace(/^\//, '')}` };
  const fixSign = (s: Sign): Sign => ({ ...s, resources: s.resources.map(fix) });

  if (Array.isArray(data)) return data.map(d => (d && typeof d === 'object' && 'resources' in d ? fixSign(d as Sign) : d));
  if (data && typeof data === 'object') {
    if ('resources' in data) return fixSign(data as Sign);
    if ('resourceId' in data && 'url' in data) return fix(data as MultimediaResource);
  }
  return data;
};

const send = (req: Request, res: Response, status: number, result: LexiconResult) =>
  res.status(status).json({ ...result, data: withAbsoluteUrls(req, result.data) });

const fail = (res: Response, error: unknown) => {
  if (error instanceof LexiconError) {
    return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
  }
  // Check de Postgres sin traducir a error de dominio: dato invalido del cliente.
  // El detalle va al log; al cliente no se le muestra el mensaje crudo de la base.
  if ((error as { code?: string }).code === '23514') {
    console.error('[lexicon] check violation', error);
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Alguno de los datos enviados no es válido' });
  }
  console.error('[lexicon]', error);
  return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
};

/** Envuelve un handler: una sola captura de errores en vez de un try/catch por ruta. */
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      fail(res, error);
    }
  };

export const makeLexiconController = (service: LexiconService) => ({
  list: handle(async (req, res) => {
    send(req, res, 200, await service.list({
      type: str(req.query.type),
      language: str(req.query.language),
      category: str(req.query.category),
      q: str(req.query.q),
      lang: str(req.query.lang),
      limit: str(req.query.limit),
      offset: str(req.query.offset),
    }));
  }),

  // Vista admin: incluye DRAFT e INACTIVE y permite filtrar por status.
  adminList: handle(async (req, res) => {
    send(req, res, 200, await service.list({
      type: str(req.query.type),
      category: str(req.query.category),
      status: str(req.query.status),
      q: str(req.query.q),
      lang: str(req.query.lang),
      limit: str(req.query.limit),
      offset: str(req.query.offset),
      includeInactive: true,
    }));
  }),

  adminGet: handle(async (req, res) => {
    send(req, res, 200, await service.get({
      code: String(req.params.code), lang: str(req.query.lang), includeInactive: true,
    }));
  }),

  search: handle(async (req, res) => {
    const q = str(req.query.q);
    if (!q) {
      res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Falta el parámetro q' });
      return;
    }
    send(req, res, 200, await service.list({
      q, type: str(req.query.type), language: str(req.query.language), lang: str(req.query.lang),
      limit: str(req.query.limit), offset: str(req.query.offset),
    }));
  }),

  alphabet: handle(async (req, res) => {
    send(req, res, 200, await service.alphabet({ language: str(req.query.language), lang: str(req.query.lang) }));
  }),

  get: handle(async (req, res) => {
    send(req, res, 200, await service.get({ code: String(req.params.code), lang: str(req.query.lang) }));
  }),

  create: handle(async (req, res) => {
    // `status` se ignora: toda seña nace en DRAFT.
    const { status: _status, ...sign } = (req.body ?? {}) as CreateSignRequestDto & { status?: unknown };
    send(req, res, 201, await service.create({ sign, userId: userIdOf(req) }));
  }),

  update: handle(async (req, res) => {
    // `code` y `status` no se cambian por aqui (INV-018): si vienen se ignoran.
    const { code: _code, status: _status, ...changes } =
      (req.body ?? {}) as UpdateSignRequestDto & { code?: string; status?: unknown };
    send(req, res, 200, await service.update({ code: String(req.params.code), changes, userId: userIdOf(req) }));
  }),

  publish: handle(async (req, res) => {
    send(req, res, 200, await service.publish({ code: String(req.params.code), userId: userIdOf(req) }));
  }),

  deactivate: handle(async (req, res) => {
    send(req, res, 200, await service.deactivate({ code: String(req.params.code), userId: userIdOf(req) }));
  }),

  upsertLocalization: handle(async (req, res) => {
    send(req, res, 200, await service.upsertLocalization({
      code: String(req.params.code),
      uiLanguage: String(req.params.lang),
      localization: (req.body ?? {}) as LocalizationRequestDto,
    }));
  }),

  addResource: handle(async (req, res) => {
    const resource = (req.body ?? {}) as AddResourceRequestDto;
    send(req, res, 201, await service.addResource({ code: String(req.params.code), resource }));
  }),

  removeResource: handle(async (req, res) => {
    send(req, res, 200, await service.removeResource({
      code: String(req.params.code),
      resourceId: Number(req.params.resourceId),
    }));
  }),

  listCategories: handle(async (req, res) => {
    send(req, res, 200, await service.listCategories());
  }),

  createCategory: handle(async (req, res) => {
    send(req, res, 201, await service.createCategory((req.body ?? {}) as CategoryRequestDto));
  }),

  updateCategory: handle(async (req, res) => {
    send(req, res, 200, await service.updateCategory({
      categoryId: req.params.id,
      changes: (req.body ?? {}) as CategoryRequestDto,
    }));
  }),

  deleteCategory: handle(async (req, res) => {
    send(req, res, 200, await service.deleteCategory({ categoryId: req.params.id }));
  }),
});
