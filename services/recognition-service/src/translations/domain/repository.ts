import { NewTranslation, Translation } from './entity';

export interface TranslationRepository {
  /** Lanza AccountErasedError si el usuario ya fue borrado (comprobacion atomica con el INSERT). */
  create(translation: NewTranslation): Promise<Translation>;
  listByUser(params: { userId: number; limit: number; offset: number }): Promise<Translation[]>;
  /**
   * Supresion (Ley 1581), en UNA transaccion: registra al usuario como borrado y borra de verdad
   * todas sus traducciones; devuelve cuantas. Idempotente.
   */
  eraseUser(userId: number): Promise<number>;
  softDelete(params: { translationId: number; userId: number }): Promise<{ translationId: number } | null>;
}
