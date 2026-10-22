import { makeRecordActivity } from './application/record_activity';
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { EventPublisher } from '@traduce/shared';
import {
  makePostgresAchievementRepository,
  makePostgresNotificationRepository,
  makePostgresProfileRepository,
  makePostgresUnitOfWork,
} from './adapters/outbound/postgres/postgres_repositories';
import { makeProfileRoutes } from './adapters/inbound/http/routes';
import { makeGetProfile } from './application/get_profile';
import { makeListAchievements } from './application/list_achievements';
import {
  makeListNotifications,
  makeMarkNotificationRead,
} from './application/notifications';
import {
  makeGetPreferences,
  makeUpdatePreferences,
} from './application/preferences';
import { makeRecordTranslation } from './application/record_translation';
import { makeEraseUserProfile } from './application/erase_user_profile';
import { makeRegisterUserProfile } from './application/register_user_profile';
import { makeRecoverUserProfile } from './application/recover_user_profile';

/** Composición: único lugar donde se eligen las implementaciones concretas. */
export const makeProfileModule = (deps: {
  pool: Pool;
  eventPublisher: EventPublisher;
  authMiddleware: RequestHandler;
}) => {
  const profiles = makePostgresProfileRepository(deps.pool);
  const achievements = makePostgresAchievementRepository(deps.pool);
  const notifications = makePostgresNotificationRepository(deps.pool);
  const unitOfWork = makePostgresUnitOfWork(deps.pool);

  const useCases = {
    getProfile: makeGetProfile({ profiles }),
    getPreferences: makeGetPreferences({ profiles }),
    updatePreferences: makeUpdatePreferences({
      // Guarda dentro de una transacción y utiliza el mismo
      // bloqueo por usuario que la eliminación de la cuenta.
      unitOfWork,
      eventPublisher: deps.eventPublisher,
    }),
    recordActivity: makeRecordActivity({ unitOfWork, eventPublisher: deps.eventPublisher }),
    listAchievements: makeListAchievements({ achievements }),
    listNotifications: makeListNotifications({ notifications }),
    markNotificationRead: makeMarkNotificationRead({ notifications }),
  };

  return {
    routers: makeProfileRoutes({
      useCases,
      authMiddleware: deps.authMiddleware,
    }),
    eventHandlers: {
      registerUserProfile: makeRegisterUserProfile({ unitOfWork }),
      eraseUserProfile: makeEraseUserProfile({ unitOfWork }),
      recordTranslation: makeRecordTranslation({
        unitOfWork,
        eventPublisher: deps.eventPublisher,
      }),
    },
    // Prepara la recuperación para una integración posterior.
    // No expone una ruta HTTP ni ejecuta reparaciones al iniciar el módulo.
    recovery: {
      recoverUserProfile: makeRecoverUserProfile({ unitOfWork }),
    },
  };
};