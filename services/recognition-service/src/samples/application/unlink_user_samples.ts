import { SampleRepository } from '../ports/outbound/sample_repository';

/**
 * Borrado de cuenta: las muestras se CONSERVAN (decision del producto); solo se desliga al operador
 * (recorded_by = null). Retirar la autorizacion de donacion de muestras es otro flujo (Consent).
 * Idempotente.
 */
export const makeUnlinkUserSamples = (deps: { sampleRepository: SampleRepository }) =>
  async (userId: number): Promise<number> => deps.sampleRepository.unlinkRecorder(userId);

export type UnlinkUserSamples = ReturnType<typeof makeUnlinkUserSamples>;
