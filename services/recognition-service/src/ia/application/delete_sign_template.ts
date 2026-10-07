import { SignTemplateRepository } from '../ports/outbound/sign_template_repository';
import { SignTemplateResult } from '../ports/inbound/sign_template_service';

export const makeDeleteSignTemplate = (deps: { signTemplateRepository: SignTemplateRepository }) =>
  async ({ templateId }: { templateId: number }): Promise<SignTemplateResult> => {
    if (!templateId) throw new Error('templateId es obligatorio');
    const result = await deps.signTemplateRepository.remove(templateId);
    if (!result) throw new Error('Plantilla no encontrada');
    return { success: true, message: 'Plantilla eliminada', data: result };
  };
