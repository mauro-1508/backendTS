import { Request, Response } from 'express';
import { ProfileError } from '../../../domain/errors';
import { makeListAchievements } from '../../../application/list_achievements';
import { makeGetProfile } from '../../../application/get_profile';
import { makeGetPreferences, makeUpdatePreferences } from '../../../application/preferences';
import {
  makeListNotifications, makeMarkNotificationRead, parseNotificationQuery,
} from '../../../application/notifications';

export interface ProfileUseCases {
  getTodayChallenge?: ReturnType<typeof import('../../../application/daily_challenge').makeGetTodayChallenge>;
  recordActivity?: ReturnType<typeof import('../../../application/record_activity').makeRecordActivity>;
  getProfile: ReturnType<typeof makeGetProfile>;
  getPreferences: ReturnType<typeof makeGetPreferences>;
  updatePreferences: ReturnType<typeof makeUpdatePreferences>;
  listAchievements: ReturnType<typeof makeListAchievements>;
  listNotifications: ReturnType<typeof makeListNotifications>;
  markNotificationRead: ReturnType<typeof makeMarkNotificationRead>;
}

const HTTP_INTERNAL_ERROR = 500;
const POSTGRES_INVALID_TEXT_REPRESENTATION = '22P02';
const HTTP_BAD_REQUEST = 400;

/** El JWT trae el id del usuario (el middleware ya garantizo que existe). */
const userIdOf = (req: Request): string => String(req.user?.userId);
/** Correo del JWT: sirve para crear el perfil si la cuenta aun no tiene uno. */
const identityOf = (req: Request) => ({ email: req.user?.email });

const fail = (res: Response, error: unknown) => {
  if (error instanceof ProfileError) {
    return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
  }
  if ((error as { code?: string }).code === POSTGRES_INVALID_TEXT_REPRESENTATION) {
    return res.status(HTTP_BAD_REQUEST).json({ success: false, code: 'VALIDATION_ERROR', message: 'Identificador no válido' });
  }
  console.error('[profile]', error);
  return res.status(HTTP_INTERNAL_ERROR).json({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
};

/** Una sola captura de errores en vez de un try/catch por ruta. */
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      fail(res, error);
    }
  };

export const makeProfileController = (useCases: ProfileUseCases) => ({
  getTodayChallenge: handle(async (req, res) => {
    if (req.user!.permissions.includes('users.manage')) return res.status(403).json({ success: false });
    return res.json(await useCases.getTodayChallenge!(userIdOf(req)));
  }),
  getProfile: handle(async (req, res) => { res.json(await useCases.getProfile(userIdOf(req))); }),

  getPreferences: handle(async (req, res) => { res.json(await useCases.getPreferences(userIdOf(req))); }),

  updatePreferences: handle(async (req, res) => { res.json(await useCases.updatePreferences(userIdOf(req), req.body, identityOf(req))); }),

  /** PATCH /me cambia las preferencias y devuelve el perfil completo (contrato). */
  updateProfile: handle(async (req, res) => {
    await useCases.updatePreferences(userIdOf(req), req.body, identityOf(req));
    res.json(await useCases.getProfile(userIdOf(req)));
  }),

  recordActivity: handle(async (req, res) => {
    if (req.user!.permissions.includes('users.manage')) return res.status(403).json({ success: false });
    try { return res.json({ data: await useCases.recordActivity!(userIdOf(req), req.body) }); }
    catch (error) { if (error instanceof Error && /^(Invalid|Unknown)/.test(error.message)) return res.status(400).json({ success: false }); throw error; }
  }),
  listAchievements: handle(async (req, res) => {
    if (req.user!.permissions.includes('users.manage')) return res.status(403).json({ success: false });
    const requested = req.query.catalogVersion;
    if (requested !== undefined && requested !== '1' && requested !== '2') {
      return res.status(HTTP_BAD_REQUEST).json({ success: false, code: 'VALIDATION_ERROR', message: 'catalogVersion debe ser 1 o 2' });
    }
    const version = requested === '2' ? 2 : 1;
    const data = await useCases.listAchievements(userIdOf(req), version);
    return res.json(version === 2 ? { data, meta: { catalogVersion: 2 } } : { data });
  }),

  listNotifications: handle(async (req, res) => {
    const query = parseNotificationQuery(req.query);
    const { items, total, unreadCount } = await useCases.listNotifications(userIdOf(req), query);
    res.json({
      data: items,
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
      unreadCount,
    });
  }),

  markNotificationRead: handle(async (req, res) => {
    res.json(await useCases.markNotificationRead(userIdOf(req), String(req.params.id)));
  }),
});
