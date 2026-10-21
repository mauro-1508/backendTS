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

/**
 * Todas las rutas exigen JWT y trabajan con el usuario autenticado.
 * notifications.manage permite cambiar sus propios avisos; no es global.
 */
export const makeProfileRoutes = (deps: { useCases: ProfileUseCases; authMiddleware: RequestHandler }) => {
  const controller = makeProfileController(deps.useCases);

  const profile = Router();
  profile.use(deps.authMiddleware);
  profile.get('/me', controller.getProfile);
  profile.patch('/me', authorizePreferencesPatch, controller.updateProfile);
  profile.get('/preferences', controller.getPreferences);
  profile.patch('/preferences', authorizePreferencesPatch, controller.updatePreferences);

  const achievements = Router();
  achievements.use(deps.authMiddleware);
  achievements.get('/', controller.listAchievements);
  achievements.post('/activity', controller.recordActivity);

  const notifications = Router();
  notifications.use(deps.authMiddleware);
  notifications.get('/', controller.listNotifications);
  notifications.patch('/:id/read', controller.markNotificationRead);

  return { profile, achievements, notifications };
};