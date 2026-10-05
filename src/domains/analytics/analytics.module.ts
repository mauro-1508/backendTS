import { RequestHandler } from 'express';
import { postgresUsageEventRepository } from './adapters/outbound/postgres/usage_event_repository';
import { makeRecordUsageEvent } from './application/record_usage_event';
import { makeGetSectionReport } from './application/get_section_report';
import { makeAnalyticsRoutes } from './adapters/inbound/http/routes';
import { AnalyticsService } from './ports/inbound/analytics_service';
import { PermissionChecker } from './ports/outbound/permission_checker';

export const makeAnalyticsModule = (deps: { authMiddleware: RequestHandler; permissionChecker: PermissionChecker }) => {
  const usageEventRepository = postgresUsageEventRepository;
  const analyticsService: AnalyticsService = {
    recordUsageEvent: makeRecordUsageEvent({ usageEventRepository }),
    getSectionReport: makeGetSectionReport({ usageEventRepository, permissionChecker: deps.permissionChecker }),
  };

  return {
    analyticsService,
    router: makeAnalyticsRoutes({ analyticsService, authMiddleware: deps.authMiddleware }),
  };
};
