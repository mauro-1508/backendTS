import { UsageEventRepository } from '../domain/repository';
import { parseDateRange, parseLimit } from '../domain/rules';
import { AnalyticsService } from '../ports/inbound/analytics_service';

type Deps = { repository: UsageEventRepository };

export const makeGetSummary = ({ repository }: Deps): AnalyticsService['summary'] =>
  async ({ from, to }) => repository.summary(parseDateRange(from, to));

export const makeGetTopSigns = ({ repository }: Deps): AnalyticsService['topSigns'] =>
  async ({ from, to, limit }) => repository.topSigns(parseDateRange(from, to), parseLimit(limit));

export const makeGetDailySeries = ({ repository }: Deps): AnalyticsService['dailySeries'] =>
  async ({ from, to }) => repository.dailySeries(parseDateRange(from, to));

export const makeGetSectionReport = ({ repository }: Deps): AnalyticsService['sectionReport'] =>
  async ({ from, to }) => {
    const range = parseDateRange(from, to);
    return { ...range, sections: await repository.sectionViews(range) };
  };
