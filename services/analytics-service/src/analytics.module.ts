import { RequestHandler } from 'express';
import { UsageEventRepository } from './domain/repository';
import { makeRecordEvent } from './application/record_event';
import { makeGetDailySeries, makeGetSectionReport, makeGetSummary, makeGetTopSigns } from './application/reports';
import { makeAnalyticsRoutes } from './adapters/inbound/http/routes';
import { AnalyticsService } from './ports/inbound/analytics_service';

export const makeAnalyticsModule = (deps: {
  repository: UsageEventRepository;
  authMiddleware: RequestHandler;
  requireAdmin: RequestHandler;
}) => {
  const analyticsService: AnalyticsService = {
    recordEvent: makeRecordEvent(deps),
    summary: makeGetSummary(deps),
    topSigns: makeGetTopSigns(deps),
    dailySeries: makeGetDailySeries(deps),
    sectionReport: makeGetSectionReport(deps),
  };

  return {
    analyticsService,
    router: makeAnalyticsRoutes({
      analyticsService,
      authMiddleware: deps.authMiddleware,
      requireAdmin: deps.requireAdmin,
    }),
  };
};
