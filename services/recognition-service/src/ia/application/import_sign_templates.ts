import { NewSignTemplate } from '../domain/entity';
import { signTemplateDomainService } from '../domain/service';
import { SignTemplateRepository } from '../ports/outbound/sign_template_repository';

/** Importa un lote (el JSON que produce el conversor del dataset o la app). */
export const makeImportSignTemplates = (deps: { signTemplateRepository: SignTemplateRepository }) =>
  async ({ templates, userId }: { templates: NewSignTemplate[]; userId: number | null }): Promise<number[]> => {
    if (!Array.isArray(templates) || templates.length === 0) {
      throw new Error('Se espera un arreglo de plantillas');
    }
    templates.forEach(t => signTemplateDomainService.ensureIsValid(t));

    const created = await deps.signTemplateRepository.createMany(templates, userId);
    return created.map(t => t.templateId);
  };
