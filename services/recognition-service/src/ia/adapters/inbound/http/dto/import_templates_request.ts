import { TemplateKind } from '../../../../domain/entity';

/** Mismo formato que exporta el frontend y que produce el conversor del dataset. */
export interface ImportTemplatesRequestDto {
  kind?: TemplateKind;
  source?: string;
  gestures?: { label: string; frames: number[][] }[];
  templates?: { label: string; kind: TemplateKind; features: number[][]; source?: string }[];
}
