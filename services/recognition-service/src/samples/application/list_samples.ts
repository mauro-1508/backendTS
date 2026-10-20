import { SampleRepository } from '../ports/outbound/sample_repository';
import { GestureSample } from '../domain/entity';

export const makeListSamples = (deps: { sampleRepository: SampleRepository }) =>
  async (input: { signCode?: string }): Promise<GestureSample[]> => {
    const signCode = input.signCode?.trim() || undefined;
    return deps.sampleRepository.list({ signCode });
  };
