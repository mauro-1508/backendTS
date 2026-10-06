import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { EventPublisher } from '@traduce/shared';
import { makePostgresLexiconRepository } from './adapters/outbound/postgres/lexicon_repository';
import { makePostgresCategoryRepository } from './adapters/outbound/postgres/category_repository';
import { makeListSigns } from './application/list_signs';
import { makeGetAlphabet } from './application/get_alphabet';
import { makeGetSign } from './application/get_sign';
import { makeCreateSign } from './application/create_sign';
import { makeUpdateSign } from './application/update_sign';
import { makePublishSign } from './application/publish_sign';
import { makeDeactivateSign } from './application/deactivate_sign';
import { makeUpsertLocalization } from './application/upsert_localization';
import { makeAddResource, makeRemoveResource } from './application/manage_resources';
import {
  makeCreateCategory, makeDeleteCategory, makeListCategories, makeUpdateCategory,
} from './application/manage_categories';
import { makeLexiconRoutes } from './adapters/inbound/http/routes';
import { LexiconService } from './ports/inbound/lexicon_service';
import { LexiconConfig } from './config';

export const makeLexiconModule = (deps: {
  pool: Pool;
  eventPublisher: EventPublisher;
  authMiddleware: RequestHandler;
  /** Exige rol ADMIN; va despues de authMiddleware. */
  requireAdmin: RequestHandler;
  config: LexiconConfig;
}) => {
  const lexiconRepository = makePostgresLexiconRepository(deps.pool);
  const resourceDeps = {
    lexiconRepository,
    mediaBaseUrl: deps.config.mediaBaseUrl,
  };
  const repoDeps = {
    lexiconRepository,
    categoryRepository: makePostgresCategoryRepository(deps.pool),
  };
  const eventDeps = { lexiconRepository, eventPublisher: deps.eventPublisher };
  const lexiconService: LexiconService = {
    list: makeListSigns(repoDeps),
    alphabet: makeGetAlphabet(repoDeps),
    get: makeGetSign(repoDeps),
    create: makeCreateSign(repoDeps),
    update: makeUpdateSign(repoDeps),
    publish: makePublishSign(eventDeps),
    deactivate: makeDeactivateSign(eventDeps),
    upsertLocalization: makeUpsertLocalization(repoDeps),
    addResource: makeAddResource(resourceDeps),
    removeResource: makeRemoveResource(repoDeps),
    listCategories: makeListCategories(repoDeps),
    createCategory: makeCreateCategory(repoDeps),
    updateCategory: makeUpdateCategory(repoDeps),
    deleteCategory: makeDeleteCategory(repoDeps),
  };

  return {
    lexiconService,
    router: makeLexiconRoutes({
      lexiconService,
      authMiddleware: deps.authMiddleware,
      requireAdmin: deps.requireAdmin,
      mediaDir: deps.config.mediaDir,
      mediaBaseUrl: deps.config.mediaBaseUrl,
    }),
  };
};
