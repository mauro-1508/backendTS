import { Request, Response } from 'express';
import { InvalidSampleError } from '../../../domain/service';
import { SampleResult, SampleService } from '../../../ports/inbound/sample_service';

const HTTP_CREATED = 201;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;

const userIdOf = (req: Request): number => (req.user as { userId: number }).userId;

const respond = async (res: Response, status: number, run: () => Promise<SampleResult>) => {
  try {
    return res.status(status).json(await run());
  } catch (error) {
    if (error instanceof InvalidSampleError) {
      return res.status(HTTP_BAD_REQUEST).json({ success: false, code: 'VALIDATION_ERROR', message: error.message });
    }
    console.error('[samples]', error);
    return res.status(HTTP_INTERNAL_ERROR).json({ success: false, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
  }
};

export const makeSampleController = (service: SampleService) => ({
  create: (req: Request, res: Response) =>
    respond(res, HTTP_CREATED, () => service.register({ body: req.body ?? {}, userId: userIdOf(req) })),

  list: (req: Request, res: Response) =>
    respond(res, HTTP_OK, () =>
      service.list({ signCode: typeof req.query.signCode === 'string' ? req.query.signCode : undefined })),
});
