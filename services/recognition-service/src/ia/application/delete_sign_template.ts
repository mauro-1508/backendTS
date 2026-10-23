import { InvalidSignTemplateError, SignTemplateNotFoundError } from '../domain/service';
import { SignTemplateRepository } from '../ports/outbound/sign_template_repository';

export const makeDeleteSignTemplate = (deps: { signTemplateRepository: SignTemplateRepository }) =>
  async ({ templateId, userId }: { templateId: number; userId?: number | null }): Promise<{ templateId: number }> => {
    if (!templateId) throw new InvalidSignTemplateError('templateId es obligatorio');
    const result = await deps.signTemplateRepository.remove(templateId, userId ?? null);
    if (!result) throw new SignTemplateNotFoundError('Plantilla no encontrada');
    return result;
  };
