/**
 * Contrato unico de los eventos entre servicios. Quien publica y quien consume importa
 * estos tipos: cambiar un campo aqui rompe la compilacion de ambos lados.
 * La routing key es `<servicio>.<Evento>`.
 */
export const EVENT_TYPES = {
  UserRegistered: 'iam.UserRegistered',
  TranslationProduced: 'recognition.TranslationProduced',
  SignPublished: 'lexicon.SignPublished',
  SignWithdrawn: 'lexicon.SignWithdrawn',
} as const;

export interface UserRegistered {
  userId: number;
  email: string;
  name: string;
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
