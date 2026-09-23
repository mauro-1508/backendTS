import { MOTION_DIM, NewSignTemplate, SEQ_LEN, STATIC_DIM, TEMPLATE_KINDS, TemplateKind } from './entity';

export class InvalidSignTemplateError extends Error {}

/** Cantidad de frames que debe traer cada tipo de plantilla. */
const framesFor = (kind: TemplateKind) => (kind === 'motion' ? SEQ_LEN : 1);

/** Valores por frame: el abecedario usa una mano y las palabras las dos. */
const dimFor = (kind: TemplateKind) => (kind === 'motion' ? MOTION_DIM : STATIC_DIM);

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
    const dim = dimFor(kind);
    for (const frame of features) {
      if (!Array.isArray(frame) || frame.length !== dim) {
        throw new InvalidSignTemplateError(`cada frame debe traer ${dim} valores para kind '${kind}'`);
      }
      if (frame.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new InvalidSignTemplateError('las features deben ser numeros finitos');
      }
    }
  },
};
