import { SampleRepository } from '../ports/outbound/sample_repository';
import { sampleDomainService } from '../domain/service';
import { GestureSample } from '../domain/entity';

export const makeRegisterSample = (deps: { sampleRepository: SampleRepository }) =>
  async (input: { body: Record<string, unknown>; userId: number }): Promise<GestureSample> => {
    const newSample = sampleDomainService.parseNewSample(input.body, input.userId);
    return deps.sampleRepository.create(newSample);
  };
