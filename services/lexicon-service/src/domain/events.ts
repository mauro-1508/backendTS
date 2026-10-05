/** Eventos que lexicon publica (routing keys `<servicio>.<Evento>`). */
export const LEXICON_EVENTS = {
  SignPublished: 'lexicon.SignPublished',
  SignWithdrawn: 'lexicon.SignWithdrawn',
} as const;

export interface SignPublishedPayload {
  lexiconId: number;
  code: string;
  type: string;
  language: string;
  letter: string | null;
  categoryId: number;
}

export interface SignWithdrawnPayload {
  lexiconId: number;
  code: string;
}
