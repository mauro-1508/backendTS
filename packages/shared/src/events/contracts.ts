/**
 * Contrato unico de los eventos entre servicios. Quien publica y quien consume importa
 * estos tipos: cambiar un campo aqui rompe la compilacion de ambos lados.
 * La routing key es `<servicio>.<Evento>`.
 */
export const EVENT_TYPES = {
  UserRegistered: 'iam.UserRegistered',
  UserDeleted: 'iam.UserDeleted',
  TranslationProduced: 'recognition.TranslationProduced',
  SignPublished: 'lexicon.SignPublished',
  SignWithdrawn: 'lexicon.SignWithdrawn',
} as const;

export interface UserRegistered {
  userId: number;
  email: string;
  name: string;
}

/** Cuenta borrada. Sin PII: cada servicio borra o desliga lo suyo con solo este id. */
export interface UserDeleted {
  userId: number;
  /** ISO 8601 */
  occurredAt: string;
}

/** Texto y glosa de una traduccion; nunca el video ni los landmarks. */
export interface TranslationProduced {
  translationId: number;
  userId: number | null;
  gloss: string;
  text: string;
  /** ISO 8601 */
  occurredAt: string;
}

export interface SignPublished {
  lexiconId: number;
  code: string;
  type: string;
  language: string;
  letter: string | null;
  categoryId: number;
}

export interface SignWithdrawn {
  lexiconId: number;
  code: string;
}

/**
 * Identidad proporcionada por IAM para recuperar su proyección en Profile.
 * No representa un nuevo registro ni contiene fechas históricas.
 *
 * El nombre puede faltar o ser null. La recuperación no inventa un nombre
 * ni sobrescribe los datos de un perfil que ya existe.
 */
export interface IdentityRecovery {
  userId: number;
  email: string;
  name?: string | null;
}