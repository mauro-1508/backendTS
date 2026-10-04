import { SampleRepository } from '../ports/outbound/sample_repository';
import { SampleResult } from '../ports/inbound/sample_service';

export const makeListSamples = (deps: { sampleRepository: SampleRepository }) =>
  async (input: { signCode?: string }): Promise<SampleResult> => {
    const signCode = input.signCode?.trim() || undefined;
    const data = await deps.sampleRepository.list({ signCode });
    return { success: true, data };
  };
