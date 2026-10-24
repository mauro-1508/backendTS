import { MOTION_DIM, SEQ_LEN, STATIC_DIM, WORD_DIM, WORD_SEQ_LEN } from '../../common/domain/landmarks';
import { NewSignTemplate, TEMPLATE_KINDS, TemplateKind } from './entity';

export class InvalidSignTemplateError extends Error {}
export class SignTemplateNotFoundError extends Error {}

/** Cantidad de frames y valores por frame de cada tipo de plantilla. */
const SHAPES: Record<TemplateKind, { frames: number; dim: number }> = {
  // Abecedario: una mano en un solo frame.
  static: { frames: 1, dim: STATIC_DIM },
  // Palabras del motor viejo: las dos manos.
  motion: { frames: SEQ_LEN, dim: MOTION_DIM },
  // Palabras del modelo propio: manos y hombros, como las graba el motor que traduce.
  word: { frames: WORD_SEQ_LEN, dim: WORD_DIM },
};

const framesFor = (kind: TemplateKind) => SHAPES[kind].frames;
const dimFor = (kind: TemplateKind) => SHAPES[kind].dim;

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
