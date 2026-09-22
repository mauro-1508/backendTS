export const TEMPLATE_KINDS = ['static', 'motion'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Debe coincidir con SEQ_LEN y FRAME_DIM del motor del frontend. */
export const SEQ_LEN = 16;
export const FRAME_DIM = 63;

export interface SignTemplate {
  templateId: number;
  label: string;
  kind: TemplateKind;
  /** 'static': un frame de 63 valores. 'motion': 16 frames de 63 valores. */
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
