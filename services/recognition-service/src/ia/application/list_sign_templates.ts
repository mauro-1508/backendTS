import { SignTemplate, TEMPLATE_KINDS, TemplateKind } from '../domain/entity';
import { InvalidSignTemplateError } from '../domain/service';
import { SignTemplateRepository } from '../ports/outbound/sign_template_repository';

export const makeListSignTemplates = (deps: { signTemplateRepository: SignTemplateRepository }) =>
  async ({ kind, label }: { kind?: string; label?: string }): Promise<SignTemplate[]> => {
    if (kind && !TEMPLATE_KINDS.includes(kind as TemplateKind)) {
      throw new InvalidSignTemplateError(`kind invalido. Valores permitidos: ${TEMPLATE_KINDS.join(', ')}`);
    }
    return deps.signTemplateRepository.list({ kind: kind as TemplateKind | undefined, label });
  };
