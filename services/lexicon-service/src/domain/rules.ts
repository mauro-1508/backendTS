import {
  CODE_PATTERN, DEFAULT_LANGUAGE, DEFAULT_UI_LANGUAGE, Localization, NewResource, RESOURCE_TYPES, ResourceType, SIGN_TYPES,
  SIGN_STATUSES, SignChanges, SignStatus, SignType, UI_LANGUAGES, UiLanguage,
} from './entity';

/** Error de dominio: lleva su `code` publico y el estado HTTP con que se responde. */
export abstract class LexiconError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
}

export class LexiconValidationError extends LexiconError {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = 400;
}
export class SignNotFoundError extends LexiconError {
  readonly code = 'SIGN_NOT_FOUND';
  readonly httpStatus = 404;
  constructor(code: string) {
    super(`No existe la seña "${code}"`);
  }
}
export class CodeTakenError extends LexiconError {
  readonly code = 'CODE_TAKEN';
  readonly httpStatus = 409;
  constructor(code: string) {
    super(`Ya existe una seña con el código "${code}"`);
  }
}
export class CategoryNotFoundError extends LexiconError {
  readonly code = 'CATEGORY_NOT_FOUND';
  readonly httpStatus = 404;
  constructor(ref: string | number) {
    super(`No existe la categoría "${ref}"`);
  }
}
export class CategoryInUseError extends LexiconError {
  readonly code = 'CATEGORY_IN_USE';
  readonly httpStatus = 409;
  constructor() {
    super('La categoría tiene señas asociadas y no se puede eliminar');
  }
}
export class CategoryNameTakenError extends LexiconError {
  readonly code = 'CATEGORY_NAME_TAKEN';
  readonly httpStatus = 409;
  constructor(name: string) {
    super(`Ya existe la categoría "${name}"`);
  }
}
export class LetterTakenError extends LexiconError {
  readonly code = 'LETTER_TAKEN';
  readonly httpStatus = 409;
  constructor() {
    super('Ya existe otra seña con esa letra en el mismo idioma de señas');
  }
}
export class PositionTakenError extends LexiconError {
  readonly code = 'POSITION_TAKEN';
  readonly httpStatus = 409;
  constructor(position?: number) {
    super(position === undefined
      ? 'Esa posición ya está ocupada por otro recurso de la seña'
      : `La posición ${position} ya está ocupada por otro recurso de la seña`);
  }
}

export const normalizeCode = (code: unknown): string =>
  String(code ?? '').trim().toUpperCase();

export const assertSignType = (type: unknown): SignType => {
  if (!SIGN_TYPES.includes(type as SignType)) {
    throw new LexiconValidationError(`type inválido. Valores permitidos: ${SIGN_TYPES.join(', ')}`);
  }
  return type as SignType;
};

export const assertSignStatus = (status: unknown): SignStatus => {
  if (!SIGN_STATUSES.includes(status as SignStatus)) {
    throw new LexiconValidationError(`status inválido. Valores permitidos: ${SIGN_STATUSES.join(', ')}`);
  }
  return status as SignStatus;
};

/** Sin valor -> ES. */
export const parseUiLanguage = (value: unknown): UiLanguage => {
  if (value === undefined || value === null || value === '') return DEFAULT_UI_LANGUAGE;
  const lang = String(value).trim().toUpperCase();
  if (!UI_LANGUAGES.includes(lang as UiLanguage)) {
    throw new LexiconValidationError(`Idioma inválido. Valores permitidos: ${UI_LANGUAGES.join(', ')}`);
  }
  return lang as UiLanguage;
};

export const optionalText = (value: unknown): string | null => {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text || null;
};

/** Texto opcional con tope de longitud (los limites son los de las columnas). */
const boundedText = (value: unknown, max: number, label: string): string | null => {
  const text = optionalText(value);
  if (text && text.length > max) {
    throw new LexiconValidationError(`${label} no puede pasar de ${max} caracteres`);
  }
  return text;
};

/** Idioma de señas (LSC...). Sin valor -> LSC. */
export const parseSignLanguage = (value: unknown): string => {
  if (value === undefined || value === null) return DEFAULT_LANGUAGE;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 10) {
    throw new LexiconValidationError('language debe ser un texto de 1 a 10 caracteres');
  }
  return value.trim().toUpperCase();
};

export const parseDisplayOrder = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new LexiconValidationError('displayOrder debe ser un entero mayor o igual a 1');
  }
  return value;
};

export const parseAnimated = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new LexiconValidationError('animated debe ser true o false');
  return value;
};

export const parsePositiveInt = (value: unknown, label: string): number => {
  const id = typeof value === 'number' ? value : Number(value);
  if (value === '' || value === null || !Number.isInteger(id) || id < 1) {
    throw new LexiconValidationError(`${label} inválido`);
  }
  return id;
};

export const MAX_PAGE_SIZE = 100;

/** `limit` (defecto y tope 100) y `offset` (>= 0) de un listado. */
export const parsePagination = (input: { limit?: unknown; offset?: unknown }) => {
  const limit = input.limit === undefined ? MAX_PAGE_SIZE
    : Math.min(parsePositiveInt(input.limit, 'limit'), MAX_PAGE_SIZE);
  let offset = 0;
  if (input.offset !== undefined) {
    offset = Number(input.offset);
    if (input.offset === '' || !Number.isInteger(offset) || offset < 0) {
      throw new LexiconValidationError('offset inválido');
    }
  }
  return { limit, offset };
};

export const MAX_QUERY_LENGTH = 100;

export const validateLocalization = (input: {
  uiLanguage?: unknown; name?: unknown; meaning?: unknown; description?: unknown;
}): Localization => {
  const name = optionalText(input.name);
  if (!name) throw new LexiconValidationError('El nombre de la localización es obligatorio');
  if (name.length > 150) throw new LexiconValidationError('El nombre no puede pasar de 150 caracteres');
  return {
    uiLanguage: parseUiLanguage(input.uiLanguage),
    name,
    meaning: boundedText(input.meaning, 255, 'El significado'),
    description: boundedText(input.description, 2000, 'La descripción'),
  };
};

/**
 * Une `localizations` con los atajos `word`/`description` (compatibilidad: son la
 * localización ES). Exige nombre en español y no repite idioma.
 */
export const buildLocalizations = (input: {
  localizations?: unknown; word?: unknown; description?: unknown;
}): Localization[] => {
  if (input.localizations !== undefined && !Array.isArray(input.localizations)) {
    throw new LexiconValidationError('localizations debe ser una lista');
  }
  const list = ((input.localizations as Record<string, unknown>[] | undefined) ?? []).map(l => {
    if (!l || typeof l !== 'object' || l.uiLanguage === undefined) {
      throw new LexiconValidationError('Cada localización necesita uiLanguage (ES o EN)');
    }
    return validateLocalization(l);
  });
  if (new Set(list.map(l => l.uiLanguage)).size !== list.length) {
    throw new LexiconValidationError('Hay idiomas repetidos en localizations');
  }
  if (input.word !== undefined || input.description !== undefined) {
    const es = list.find(l => l.uiLanguage === 'ES');
    const merged = validateLocalization({
      uiLanguage: 'ES',
      name: input.word ?? es?.name,
      meaning: es?.meaning,
      description: input.description ?? es?.description,
    });
    if (es) Object.assign(es, merged); else list.push(merged);
  }
  if (!list.some(l => l.uiLanguage === 'ES')) {
    throw new LexiconValidationError('El nombre en español es obligatorio (word o localizations con uiLanguage ES)');
  }
  return list;
};

/**
 * INV-013: `letter` solo existe cuando type = LETTER, y es una sola letra
 * mayuscula (A-Z o Ñ).
 */
export const assertLetterMatchesType = (type: SignType, letter: string | null | undefined) => {
  if (type === 'LETTER') {
    if (!letter || !/^[A-ZÑ]$/.test(letter)) {
      throw new LexiconValidationError('Una seña LETTER necesita "letter" (una letra A-Z o Ñ)');
    }
  } else if (letter) {
    throw new LexiconValidationError('"letter" solo aplica cuando type = LETTER');
  }
};

/** Segmentos fijos de la API: `/:code` no puede llamarse igual (Express no distingue mayusculas). */
const RESERVED_CODES = ['ALPHABET', 'SEARCH', 'CATEGORIES', 'ADMIN', 'MEDIA'];

export const assertCode = (value: unknown): string => {
  const code = normalizeCode(value);
  if (!CODE_PATTERN.test(code)) {
    throw new LexiconValidationError('code inválido: solo A-Z, 0-9 y _ (máximo 50)');
  }
  if (RESERVED_CODES.includes(code)) {
    throw new LexiconValidationError(`code reservado: no puede ser ${RESERVED_CODES.join(', ')}`);
  }
  return code;
};

export const parseCategoryId = (value: unknown): number => {
  return parsePositiveInt(value, 'categoryId');
};

export const validateCategoryDescription = (value: unknown): string | null =>
  boundedText(value, 255, 'La descripción de la categoría');

export const validateCategoryName = (value: unknown): string => {
  const name = optionalText(value);
  if (!name) throw new LexiconValidationError('El nombre de la categoría es obligatorio');
  if (name.length > 100) throw new LexiconValidationError('El nombre de la categoría no puede pasar de 100 caracteres');
  return name;
};

export const validateChanges = (
  current: { type: SignType; letter: string | null },
  changes: SignChanges,
): SignChanges => {
  const next: SignChanges = { ...changes };
  if (next.type !== undefined) next.type = assertSignType(next.type);
  if (next.letter !== undefined) next.letter = next.letter ? String(next.letter).trim().toUpperCase() : null;
  if (next.language !== undefined) next.language = parseSignLanguage(next.language);
  if (next.displayOrder !== undefined) next.displayOrder = parseDisplayOrder(next.displayOrder);
  if (next.animated !== undefined) next.animated = parseAnimated(next.animated);

  if (next.type !== undefined || next.letter !== undefined) {
    assertLetterMatchesType(
      next.type ?? current.type,
      next.letter !== undefined ? next.letter : current.letter,
    );
  }
  return next;
};

const RELATIVE_URL = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.(glb|gltf|png|jpg|jpeg|webp|gif|mp4|webm)$/;

/**
 * Lista blanca: ruta relativa al directorio de medios, o URL https cuyo origen sea
 * el de LEXICON_MEDIA_BASE_URL (sin esa variable no se aceptan absolutas).
 */
const assertResourceUrl = (url: string, mediaBaseUrl?: string) => {
  if (RELATIVE_URL.test(url)) return;
  let origin: string | null = null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') origin = parsed.origin;
  } catch { /* no es absoluta */ }
  if (origin && mediaBaseUrl) {
    try {
      if (new URL(mediaBaseUrl).origin === origin) return;
    } catch { /* base mal configurada: se rechaza */ }
  }
  throw new LexiconValidationError(
    'url inválida: use una ruta relativa de medios (p. ej. alfabeto/glb/A.glb) o una URL https del origen de medios configurado',
  );
};

export const validateResource = (input: NewResource, mediaBaseUrl?: string): NewResource => {
  if (!RESOURCE_TYPES.includes(input.type as ResourceType)) {
    throw new LexiconValidationError(`type de recurso inválido. Valores permitidos: ${RESOURCE_TYPES.join(', ')}`);
  }
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!url) throw new LexiconValidationError('url es obligatoria');
  if (url.length > 255) throw new LexiconValidationError('url no puede pasar de 255 caracteres');
  assertResourceUrl(url, mediaBaseUrl);
  return {
    type: input.type,
    url,
    mimeType: boundedText(input.mimeType, 100, 'mimeType'),
    displayOrder: input.displayOrder === undefined || input.displayOrder === null
      ? undefined : parseDisplayOrder(input.displayOrder),
    description: boundedText(input.description, 255, 'description'),
  };
};
