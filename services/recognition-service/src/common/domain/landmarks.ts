/** Debe coincidir con SEQ_LEN y los tamanos de frame del motor del frontend. */
export const SEQ_LEN = 16;
/** Abecedario: una mano, 21 puntos x (x, y, z). */
export const STATIC_DIM = 63;
/** Palabras: las dos manos, porque la mayoria de las senas de LSC son bimanuales. */
export const MOTION_DIM = 126;

/**
 * Palabras agregadas sin reentrenar: el mismo formato que consume el modelo
 * propio (frontend featureBuilder.ts), 30 frames de 126 coordenadas + 2
 * banderas de presencia de mano.
 */
export const WORD_SEQ_LEN = 30;
export const WORD_DIM = 128;
