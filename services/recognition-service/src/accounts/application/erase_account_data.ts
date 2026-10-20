import { EraseUserTranslations, UnlinkUserSamples } from '../ports/outbound/account_data_erasers';

/**
 * Supresion de cuenta: borra las traducciones (Postgres, y registra al usuario como borrado) y desliga
 * al usuario de las muestras (Mongo: recorded_by = null; las muestras se conservan).
 * Ambos pasos son idempotentes, asi que una reentrega no hace dano.
 */
export const makeEraseAccountData = (deps: {
  eraseTranslations: EraseUserTranslations;
  unlinkSamples: UnlinkUserSamples;
}) =>
  async (userId: number): Promise<{ translations: number; samples: number }> => {
    const translations = await deps.eraseTranslations(userId);
    const samples = await deps.unlinkSamples(userId);
    return { translations, samples };
  };

export type EraseAccountData = ReturnType<typeof makeEraseAccountData>;
