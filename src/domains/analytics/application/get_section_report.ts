import { UsageEventRepository } from '../ports/outbound/usage_event_repository';
import { PermissionChecker } from '../ports/outbound/permission_checker';
import { SectionReport } from '../ports/inbound/analytics_service';
import { analyticsDomainService, PermissionDeniedError } from '../domain/service';

export const STATS_READ = 'stats.read';

export const makeGetSectionReport = (deps: {
  usageEventRepository: UsageEventRepository;
  permissionChecker: PermissionChecker;
  now?: () => Date;
}) =>
  async (input: { userId: number; from?: string; to?: string }): Promise<SectionReport> => {
    if (!(await deps.permissionChecker.hasPermission(input.userId, STATS_READ))) {
      throw new PermissionDeniedError('Permiso insuficiente');
    }
    const range = analyticsDomainService.normalizeRange(input, (deps.now ?? (() => new Date()))());
    const rows = await deps.usageEventRepository.countSectionViews(range);
    // INV-012: solo agregados; se reconstruye la fila para no filtrar campos extra.
    return { ...range, sections: rows.map((r) => ({ section: r.section, visits: r.visits })) };
  };
