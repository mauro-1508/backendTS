import express, { Express, RequestHandler } from 'express';
import { errorHandler } from '@traduce/shared';
import { makeLexiconModule } from './lexicon.module';

const SERVICE_NAME = 'lexicon-service';
const JSON_BODY_LIMIT = '2mb';
const LEXICON_ROUTE = '/api/lexicon';

export const makeLexiconApp = (deps: Parameters<typeof makeLexiconModule>[0]): Express => {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const health: RequestHandler = (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  };
  app.get('/health', health);

  app.use(LEXICON_ROUTE, makeLexiconModule(deps).router);
  app.use(errorHandler);
  return app;
};
