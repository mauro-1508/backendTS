import { makeGetChallengeRewardSummary } from './application/get_challenge_reward_summary';
import { makePostgresChallengeRepository } from './adapters/outbound/postgres/challenge_repository';
import { makeGetTodayChallenge } from './application/daily_challenge';
import { makeRecordActivity } from './application/record_activity';
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { EventPublisher } from '@traduce/shared';
import {
  makePostgresAdminRecipientRepository, makePostgresReportRunQuery,
} from './adapters/outbound/postgres/admin_report_repositories';
import {
  makePostgresAchievementRepository,
  makePostgresNotificationRepository,
  makePostgresProfileRepository,
  makePostgresUnitOfWork,
} from './adapters/outbound/postgres/postgres_repositories';
import { makePostgresEmailOutbox } from './adapters/outbound/postgres/email_outbox_repository';
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
import { makeDeliverEmailNotifications } from './application/deliver_email_notifications';
import { makeRunAdminReports } from './application/run_admin_reports';
import { makeTrackAdminRecipient } from './application/track_admin_recipient';
import { AdminDirectory } from './ports/admin_directory';
import { Mailer } from './ports/mailer';
import { StatsGateway } from './ports/stats_gateway';

/** Composición: único lugar donde se eligen las implementaciones concretas. */
export const makeProfileModule = (deps: {
  pool: Pool;
  eventPublisher: EventPublisher;
  authMiddleware: RequestHandler;
  /** Sin esto no hay resumenes de administracion (jobs.runAdminReports queda indefinido). */
  statsGateway?: StatsGateway;
  /** Lista de admins de iam para los reportes; sin esto solo se avisa a los admins que profile ya vio. */
  adminDirectory?: AdminDirectory;
  /** Sin esto no se envian correos: los avisos EMAIL esperan PENDING (jobs.deliverEmails indefinido). */
  mailer?: Mailer;
}) => {
  const profiles = makePostgresProfileRepository(deps.pool);
  const achievements = makePostgresAchievementRepository(deps.pool);
  const notifications = makePostgresNotificationRepository(deps.pool);
  const adminRecipients = makePostgresAdminRecipientRepository(deps.pool);
  const reportRuns = makePostgresReportRunQuery(deps.pool);
  const unitOfWork = makePostgresUnitOfWork(deps.pool);

  const useCases = {
    getChallengeRewardSummary: makeGetChallengeRewardSummary({ challenges: makePostgresChallengeRepository(deps.pool) }),
    getTodayChallenge: makeGetTodayChallenge({ unitOfWork }),
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
      trackAdmin: makeTrackAdminRecipient({ recipients: adminRecipients }),
    }),
    eventHandlers: {
      registerUserProfile: makeRegisterUserProfile({ unitOfWork }),
      eraseUserProfile: makeEraseUserProfile({ unitOfWork }),
      recordTranslation: makeRecordTranslation({
        unitOfWork,
        eventPublisher: deps.eventPublisher,
      }),
    },
    jobs: {
      runAdminReports: deps.statsGateway
        ? makeRunAdminReports({
          stats: deps.statsGateway, recipients: adminRecipients, directory: deps.adminDirectory,
          reportRuns, unitOfWork, logger: console,
          channels: ['IN_APP', 'EMAIL'],
        })
        : undefined,
      deliverEmails: deps.mailer
        ? makeDeliverEmailNotifications({ outbox: makePostgresEmailOutbox(deps.pool), mailer: deps.mailer, logger: console })
        : undefined,
    },
    // Prepara la recuperación para una integración posterior.
    // No expone una ruta HTTP ni ejecuta reparaciones al iniciar el módulo.
    recovery: {
      recoverUserProfile: makeRecoverUserProfile({ unitOfWork }),
    },
  };
};