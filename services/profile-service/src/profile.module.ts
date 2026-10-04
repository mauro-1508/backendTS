import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { EventPublisher } from '@traduce/shared';
import {
  makePostgresAchievementRepository, makePostgresNotificationRepository, makePostgresProfileRepository,
  makePostgresUnitOfWork,
} from './adapters/outbound/postgres/postgres_repositories';
import { makeProfileRoutes } from './adapters/inbound/http/routes';
import { makeGetProfile } from './application/get_profile';
import { makeListAchievements } from './application/list_achievements';
import { makeListNotifications, makeMarkNotificationRead } from './application/notifications';
import { makeGetPreferences, makeUpdatePreferences } from './application/preferences';
import { makeRecordTranslation } from './application/record_translation';
import { makeRegisterUserProfile } from './application/register_user_profile';

/** Composicion: unico lugar donde se eligen las implementaciones concretas. */
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
    updatePreferences: makeUpdatePreferences({ profiles, eventPublisher: deps.eventPublisher }),
    listAchievements: makeListAchievements({ achievements }),
    listNotifications: makeListNotifications({ notifications }),
    markNotificationRead: makeMarkNotificationRead({ notifications }),
  };

  return {
    routers: makeProfileRoutes({ useCases, authMiddleware: deps.authMiddleware }),
    eventHandlers: {
      registerUserProfile: makeRegisterUserProfile({ unitOfWork }),
      recordTranslation: makeRecordTranslation({ unitOfWork, eventPublisher: deps.eventPublisher }),
    },
  };
};
