import { RequestHandler } from 'express';
import { postgresSignTemplateRepository } from './adapters/outbound/postgres/sign_template_repository';
import { makeImportSignTemplates } from './application/import_sign_templates';
import { makeListSignTemplates } from './application/list_sign_templates';
import { makeDeleteSignTemplate } from './application/delete_sign_template';
import { makeSignTemplateRoutes } from './adapters/inbound/http/routes';
import { SignTemplateService } from './ports/inbound/sign_template_service';

export const makeIaModule = (deps: { authMiddleware: RequestHandler }) => {
  const repoDeps = { signTemplateRepository: postgresSignTemplateRepository };
  const signTemplateService: SignTemplateService = {
    importMany: makeImportSignTemplates(repoDeps),
    list: makeListSignTemplates(repoDeps),
    remove: makeDeleteSignTemplate(repoDeps),
  };

  return {
    signTemplateService,
    router: makeSignTemplateRoutes({ signTemplateService, authMiddleware: deps.authMiddleware }),
  };
};
