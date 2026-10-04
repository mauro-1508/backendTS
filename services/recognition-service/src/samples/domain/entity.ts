/** Una repeticion grabada de una sena: solo landmarks, nunca video. */
export interface GestureSample {
  sampleId: string;
  /** Codigo de la sena en lexicon-service (referencia logica, sin FK). */
  signCode: string;
  /** Agrupa las repeticiones de una misma sesion de grabacion. */
  captureSessionId: string;
  /** Usuario (iam-service) que opero la grabacion. */
  recordedBy: number;
  performedBy: string;
  consentGrantedAt: Date;
  consentTermsVersion: string;
  /** Frames de la repeticion: cada frame son los valores de los landmarks. */
  frames: number[][];
  isValidated: boolean;
  createdAt: Date;
}

export type NewGestureSample = Omit<GestureSample, 'sampleId' | 'isValidated' | 'createdAt'>;

export interface SampleFilter {
  signCode?: string;
}
