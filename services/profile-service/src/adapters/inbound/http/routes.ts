import { RequestHandler, Router } from 'express';
import { PERMISSIONS, requirePermission } from '@traduce/shared';
import { makeProfileController, ProfileUseCases } from './profile_controller';

const requireNotificationsPermission =
  requirePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);

/** La presencia del campo exige permiso, también para false o valores inválidos. */
const authorizePreferencesPatch: RequestHandler = (req, res, next) => {
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'notificationsEnabled')) {
    requireNotificationsPermission(req, res, next);
    return;
  }
  next();
};

export type TrackAdmin = (userId: string, roles: readonly string[]) => Promise<void>;

/** Va despues del auth: anota si el usuario es ADMIN. Nunca bloquea la peticion. */
const makeTrackAdminMiddleware = (trackAdmin: TrackAdmin): RequestHandler => (req, _res, next) => {
  const user = req.user;
  if (!user) {
    next();
    return;
  }
  trackAdmin(String(user.userId), user.roles ?? [])
    .catch(error => console.error('[profile] no se pudo registrar al admin', error))
    .finally(next);
};

/**
 * Todas las rutas exigen JWT y trabajan con el usuario autenticado.
 * notifications.manage permite cambiar sus propios avisos; no es global.
 */
export const makeProfileRoutes = (deps: { useCases: ProfileUseCases; authMiddleware: RequestHandler; trackAdmin?: TrackAdmin }) => {
  const controller = makeProfileController(deps.useCases);
  const trackAdmin = deps.trackAdmin ? [makeTrackAdminMiddleware(deps.trackAdmin)] : [];

  const profile = Router();
  profile.use(deps.authMiddleware);
  // La lectura del reto no actualiza tampoco el directorio de administradores.
  profile.get('/challenges/today', controller.getTodayChallenge);
  profile.get('/challenges/rewards/summary', controller.getChallengeRewardSummary);
  if (trackAdmin.length) profile.use(...trackAdmin);
  profile.get('/me', controller.getProfile);
  profile.patch('/me', authorizePreferencesPatch, controller.updateProfile);
  profile.get('/preferences', controller.getPreferences);
  profile.patch('/preferences', authorizePreferencesPatch, controller.updatePreferences);

  const achievements = Router();
  achievements.use(deps.authMiddleware);
  achievements.get('/', controller.listAchievements);
  achievements.post('/activity', controller.recordActivity);

  const notifications = Router();
  notifications.use(deps.authMiddleware, ...trackAdmin);
  notifications.get('/', controller.listNotifications);
  notifications.patch('/:id/read', controller.markNotificationRead);

  return { profile, achievements, notifications };
};