import { UsageEventRepository } from '../ports/outbound/usage_event_repository';
import { RecordUsageEventInput } from '../ports/inbound/analytics_service';
import { analyticsDomainService } from '../domain/service';

export const makeRecordUsageEvent = (deps: { usageEventRepository: UsageEventRepository }) =>
  async (input: RecordUsageEventInput): Promise<void> => {
    const event = {
      userId: input.userId,
      sessionId: null, // aun no hay sesiones (user_sessions pendiente)
      section: input.section,
      eventType: input.eventType,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
    };
    analyticsDomainService.ensureEventIsValid(event);
    await deps.usageEventRepository.append(event);
  };
