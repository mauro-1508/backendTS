import { NewSignTemplate, SignTemplate, TemplateKind } from '../../domain/entity';

export interface SignTemplateService {
  /** Devuelve los ids de las plantillas creadas. */
  importMany(input: { templates: NewSignTemplate[]; userId: number | null }): Promise<number[]>;
  list(input: { kind?: string; label?: string }): Promise<SignTemplate[]>;
  /** Lanza Error si la plantilla no existe. */
  remove(input: { templateId: number; userId?: number | null }): Promise<{ templateId: number }>;
}

export type { NewSignTemplate, TemplateKind };
