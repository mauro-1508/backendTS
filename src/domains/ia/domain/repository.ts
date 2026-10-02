import { NewSignTemplate, SignTemplate, TemplateKind } from './entity';

export interface SignTemplateRepository {
  createMany(templates: NewSignTemplate[], createdBy: number | null): Promise<SignTemplate[]>;
  list(filter: { kind?: TemplateKind; label?: string }): Promise<SignTemplate[]>;
  remove(templateId: number): Promise<{ templateId: number } | null>;
}
