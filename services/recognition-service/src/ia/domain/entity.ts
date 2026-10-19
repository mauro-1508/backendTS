export const TEMPLATE_KINDS = ['static', 'motion'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

// Constantes compartidas con samples: viven en common; se re-exportan para motion_template y training.
export { MOTION_DIM, SEQ_LEN, STATIC_DIM } from '../../common/domain/landmarks';

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
