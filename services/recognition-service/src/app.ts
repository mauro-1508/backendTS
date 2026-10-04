import express, { Express, RequestHandler } from 'express';
import { Pool } from 'pg';
import { EventPublisher, errorHandler } from '@traduce/shared';
import { makeTranslationsModule } from './translations/translations.module';
import { makeIaModule } from './ia/ia.module';
import { makeSamplesModule } from './samples/samples.module';
import { SampleRepository } from './samples/ports/outbound/sample_repository';

const SERVICE_NAME = 'recognition-service';
const JSON_BODY_LIMIT = '2mb';
const TRANSLATIONS_ROUTE = '/api/translations';
const SAMPLES_ROUTE = '/api/samples';
/** Ruta definitiva de las plantillas y ruta anterior que sigue usando el frontend. */
const SIGN_TEMPLATES_ROUTES = ['/api/recognition/sign-templates', '/api/sign-templates'];

export interface RecognitionAppDeps {
  pool: Pool;
  eventPublisher: EventPublisher;
  sampleRepository: SampleRepository;
  authMiddleware: RequestHandler;
  /** Exige rol ADMIN; va despues de authMiddleware. */
  requireAdmin: RequestHandler;
}

export const makeRecognitionApp = (deps: RecognitionAppDeps): Express => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  });

  app.use(TRANSLATIONS_ROUTE, makeTranslationsModule(deps).router);
  app.use(SIGN_TEMPLATES_ROUTES, makeIaModule(deps).router);
  app.use(SAMPLES_ROUTE, makeSamplesModule(deps).router);
  app.use(errorHandler);
  return app;
};
