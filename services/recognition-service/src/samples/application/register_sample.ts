import { SampleRepository } from '../ports/outbound/sample_repository';
import { sampleDomainService } from '../domain/service';
import { SampleResult } from '../ports/inbound/sample_service';

export const makeRegisterSample = (deps: { sampleRepository: SampleRepository }) =>
  async (input: { body: Record<string, unknown>; userId: number }): Promise<SampleResult> => {
    const newSample = sampleDomainService.parseNewSample(input.body, input.userId);
    const created = await deps.sampleRepository.create(newSample);
    return { success: true, message: 'Muestra guardada', data: created };
  };
