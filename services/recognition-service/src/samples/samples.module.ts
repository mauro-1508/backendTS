import { RequestHandler } from 'express';
import { SampleRepository } from './ports/outbound/sample_repository';
import { makeRegisterSample } from './application/register_sample';
import { makeListSamples } from './application/list_samples';
import { makeSampleRoutes } from './adapters/inbound/http/routes';
import { SampleService } from './ports/inbound/sample_service';

export const makeSamplesModule = (deps: {
  sampleRepository: SampleRepository;
  authMiddleware: RequestHandler;
  requireAdmin: RequestHandler;
}) => {
  const repoDeps = { sampleRepository: deps.sampleRepository };
  const sampleService: SampleService = {
    register: makeRegisterSample(repoDeps),
    list: makeListSamples(repoDeps),
  };

  return {
    sampleService,
    router: makeSampleRoutes({
      sampleService,
      authMiddleware: deps.authMiddleware,
      requireAdmin: deps.requireAdmin,
    }),
  };
};
