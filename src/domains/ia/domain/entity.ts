export const TEMPLATE_KINDS = ['static', 'motion'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Debe coincidir con SEQ_LEN y los tamanos de frame del motor del frontend. */
export const SEQ_LEN = 16;
/** Abecedario: una mano, 21 puntos x (x, y, z). */
export const STATIC_DIM = 63;
/** Palabras: las dos manos, porque la mayoria de las senas de LSC son bimanuales. */
export const MOTION_DIM = 126;

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
