/** Borra las traducciones del usuario y devuelve cuantas. */
export type EraseUserTranslations = (userId: number) => Promise<number>;
/** Desliga al usuario de sus muestras y devuelve cuantas. */
export type UnlinkUserSamples = (userId: number) => Promise<number>;
