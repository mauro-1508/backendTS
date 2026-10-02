import { NewSignTemplate, TemplateKind } from '../../domain/entity';

export interface SignTemplateResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface SignTemplateService {
  importMany(input: { templates: NewSignTemplate[]; userId: number | null }): Promise<SignTemplateResult>;
  list(input: { kind?: string; label?: string }): Promise<SignTemplateResult>;
  remove(input: { templateId: number }): Promise<SignTemplateResult>;
}

export type { NewSignTemplate, TemplateKind };
