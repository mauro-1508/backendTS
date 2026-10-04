import { RequestHandler, Router } from 'express';
import { makeProfileController, ProfileUseCases } from './profile_controller';

/**
 * Rutas del contrato profile-service.yaml. Todas exigen JWT: cada usuario solo ve lo suyo.
 * Los logros y las notificaciones cuelgan de su propio prefijo en el gateway, por eso se
 * devuelven tres routers.
 */
export const makeProfileRoutes = (deps: { useCases: ProfileUseCases; authMiddleware: RequestHandler }) => {
  const controller = makeProfileController(deps.useCases);

  const profile = Router();
  profile.use(deps.authMiddleware);
  profile.get('/me', controller.getProfile);
  profile.patch('/me', controller.updateProfile);
  profile.get('/preferences', controller.getPreferences);
  profile.patch('/preferences', controller.updatePreferences);

  const achievements = Router();
  achievements.use(deps.authMiddleware);
  achievements.get('/', controller.listAchievements);

  const notifications = Router();
  notifications.use(deps.authMiddleware);
  notifications.get('/', controller.listNotifications);
  notifications.patch('/:id/read', controller.markNotificationRead);

  return { profile, achievements, notifications };
};
