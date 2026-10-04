import { TEMPLATE_KINDS, TemplateKind } from '../domain/entity';
import { SignTemplateRepository } from '../ports/outbound/sign_template_repository';
import { SignTemplateResult } from '../ports/inbound/sign_template_service';

export const makeListSignTemplates = (deps: { signTemplateRepository: SignTemplateRepository }) =>
  async ({ kind, label }: { kind?: string; label?: string }): Promise<SignTemplateResult> => {
    if (kind && !TEMPLATE_KINDS.includes(kind as TemplateKind)) {
      throw new Error(`kind invalido. Valores permitidos: ${TEMPLATE_KINDS.join(', ')}`);
    }
    const items = await deps.signTemplateRepository.list({ kind: kind as TemplateKind | undefined, label });
    return { success: true, data: items };
  };
