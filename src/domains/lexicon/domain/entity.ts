export const SIGN_TYPES = ['LETTER', 'WORD', 'PHRASE'] as const;
export type SignType = (typeof SIGN_TYPES)[number];

export const SIGN_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;
export type SignStatus = (typeof SIGN_STATUSES)[number];

/** MODEL_3D: .glb del alfabeto. IMAGE: miniatura de la card. */
export const RESOURCE_TYPES = ['MODEL_3D', 'IMAGE', 'VIDEO', 'GIF'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const DEFAULT_LANGUAGE = 'LSC';

/**
 * `code` es el contrato con el reconocedor: es la clase que predice el modelo
 * de IA (ver docs/06-data/domains/04-lexicon.md). No se renombra una vez
 * publicado; para retirar una sena se pasa a INACTIVE.
 */
export const CODE_PATTERN = /^[A-Z0-9_]{1,50}$/;

export interface MultimediaResource {
  resourceId: number;
  type: ResourceType;
  /** Ruta relativa al directorio de medios (`alfabeto/glb/A.glb`) o URL absoluta. */
  url: string;
  mimeType: string | null;
  displayOrder: number;
  description: string | null;
}

export const UI_LANGUAGES = ['ES', 'EN'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export const DEFAULT_UI_LANGUAGE: UiLanguage = 'ES';

/** Nombre, significado y descripcion de una sena en un idioma de la interfaz. */
export interface Localization {
  uiLanguage: UiLanguage;
  name: string;
  meaning: string | null;
  description: string | null;
}

export interface Category {
  categoryId: number;
  name: string;
  description: string | null;
}

export interface CategorySummary extends Category {
  /** Solo cuenta senas ACTIVE. */
  signCount: number;
}

export interface Sign {
  lexiconId: number;
  code: string;
  /** Nombre en el idioma pedido (con respaldo a ES y luego a cualquiera). */
  word: string;
  meaning: string | null;
  type: SignType;
  letter: string | null;
  language: string;
  categoryId: number;
  /** Nombre de la categoria. */
  category: string;
  description: string | null;
  /** true si el modelo 3D trae una animacion (letras con movimiento: G, H, J, Ñ, S, Z). */
  animated: boolean;
  displayOrder: number;
  status: SignStatus;
  resources: MultimediaResource[];
  /** Solo en el detalle de una sena. */
  localizations?: Localization[];
  createdAt: Date;
  updatedAt: Date;
}

/** Lo que el repositorio necesita para crear: ya validado y con la categoria resuelta. */
export interface NewSign {
  code: string;
  type: SignType;
  letter: string | null;
  language: string;
  categoryId: number;
  animated: boolean;
  displayOrder: number;
  localizations: Localization[];
}

/** Cambios sobre las columnas de la sena (ni `code` ni `status`). */
export interface SignChanges {
  type?: SignType;
  letter?: string | null;
  language?: string;
  categoryId?: number;
  animated?: boolean;
  displayOrder?: number;
}

export interface NewResource {
  type: ResourceType;
  url: string;
  mimeType?: string | null;
  displayOrder?: number;
  description?: string | null;
}

export interface SignFilter {
  type?: SignType;
  language?: string;
  /** Nombre de la categoria. */
  category?: string;
  q?: string;
  status?: SignStatus;
  limit?: number;
  offset?: number;
  /** Idioma de la interfaz para `word`, `description` y la relevancia. */
  lang: UiLanguage;
  /** Por defecto solo ACTIVE (INV-019). */
  includeInactive?: boolean;
}
