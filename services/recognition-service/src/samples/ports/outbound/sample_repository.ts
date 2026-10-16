import { GestureSample, NewGestureSample, SampleFilter } from '../../domain/entity';

export interface SampleRepository {
  create(sample: NewGestureSample): Promise<GestureSample>;
  list(filter: SampleFilter): Promise<GestureSample[]>;
  /**
   * Borrado de cuenta: las muestras NO se borran, solo se desligan (recorded_by = null) del operador.
   * Retirar la autorizacion de donacion de muestras es otro flujo (Consent). Devuelve cuantas. Idempotente.
   */
  unlinkRecorder(userId: number): Promise<number>;
}
