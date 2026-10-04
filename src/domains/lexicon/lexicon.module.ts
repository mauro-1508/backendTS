import path from 'path';
import { RequestHandler } from 'express';
import { postgresLexiconRepository } from './adapters/outbound/postgres/lexicon_repository';
import { postgresCategoryRepository } from './adapters/outbound/postgres/category_repository';
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

export const makeLexiconModule = (deps: {
  authMiddleware: RequestHandler;
  /** Exige rol ADMIN; va despues de authMiddleware. */
  requireAdmin: RequestHandler;
  mediaDir?: string;
}) => {
  const resourceDeps = {
    lexiconRepository: postgresLexiconRepository,
    mediaBaseUrl: process.env.LEXICON_MEDIA_BASE_URL,
  };
  const repoDeps = {
    lexiconRepository: postgresLexiconRepository,
    categoryRepository: postgresCategoryRepository,
  };
  const lexiconService: LexiconService = {
    list: makeListSigns(repoDeps),
    alphabet: makeGetAlphabet(repoDeps),
    get: makeGetSign(repoDeps),
    create: makeCreateSign(repoDeps),
    update: makeUpdateSign(repoDeps),
    publish: makePublishSign(repoDeps),
    deactivate: makeDeactivateSign(repoDeps),
    upsertLocalization: makeUpsertLocalization(repoDeps),
    addResource: makeAddResource(resourceDeps),
    removeResource: makeRemoveResource(repoDeps),
    listCategories: makeListCategories(repoDeps),
    createCategory: makeCreateCategory(repoDeps),
    updateCategory: makeUpdateCategory(repoDeps),
    deleteCategory: makeDeleteCategory(repoDeps),
  };

  const mediaDir = deps.mediaDir
    || process.env.LEXICON_MEDIA_DIR
    || path.resolve(process.cwd(), 'public', 'lexicon');

  return {
    lexiconService,
    router: makeLexiconRoutes({
      lexiconService,
      authMiddleware: deps.authMiddleware,
      requireAdmin: deps.requireAdmin,
      mediaDir,
    }),
  };
};
