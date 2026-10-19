export const TEMPLATE_KINDS = ['static', 'motion'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export interface SignTemplate {
  templateId: number;
  label: string;
  kind: TemplateKind;
  /** 'static': 1 frame de 63 valores. 'motion': 16 frames de 126. */
  features: number[][];
  source: string;
  createdBy: number | null;
  createdAt: Date;
}

export interface NewSignTemplate {
  label: string;
  kind: TemplateKind;
  features: number[][];
  source?: string;
}
