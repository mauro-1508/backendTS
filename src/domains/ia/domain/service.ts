import { FRAME_DIM, NewSignTemplate, SEQ_LEN, TEMPLATE_KINDS, TemplateKind } from './entity';

export class InvalidSignTemplateError extends Error {}

/** Cantidad de frames que debe traer cada tipo de plantilla. */
const framesFor = (kind: TemplateKind) => (kind === 'motion' ? SEQ_LEN : 1);

export const signTemplateDomainService = {
  ensureIsValid(input: Partial<NewSignTemplate>): asserts input is NewSignTemplate {
    const { label, kind, features } = input;
    if (!label || typeof label !== 'string' || !label.trim()) {
      throw new InvalidSignTemplateError('label es obligatorio');
    }
    if (!kind || !TEMPLATE_KINDS.includes(kind)) {
      throw new InvalidSignTemplateError(`kind invalido. Valores permitidos: ${TEMPLATE_KINDS.join(', ')}`);
    }
    if (!Array.isArray(features) || features.length !== framesFor(kind)) {
      throw new InvalidSignTemplateError(`features debe traer ${framesFor(kind)} frames para kind '${kind}'`);
    }
    for (const frame of features) {
      if (!Array.isArray(frame) || frame.length !== FRAME_DIM) {
        throw new InvalidSignTemplateError(`cada frame debe traer ${FRAME_DIM} valores`);
      }
      if (frame.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new InvalidSignTemplateError('las features deben ser numeros finitos');
      }
    }
  },
};
