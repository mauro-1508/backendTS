import { TranslationRepository } from '../ports/outbound/translation_repository';

/** Dias que se guardan las traducciones antes de borrarlas (historial del usuario). */
export const DEFAULT_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Retencion: borra las traducciones con mas de `retentionDays` dias. Sus conteos pasan al
 * resumen de estadisticas, asi que las cifras del admin y del perfil no cambian.
 * Los logros no dependen de esta tabla (profile-service lleva sus propios contadores).
 */
export const makePurgeExpiredTranslations = (deps: {
  translationRepository: TranslationRepository;
  retentionDays: number;
  now?: () => Date;
}) =>
  async (): Promise<number> => {
    const now = (deps.now ?? (() => new Date()))();
    const cutoff = new Date(now.getTime() - deps.retentionDays * DAY_MS);
    return deps.translationRepository.purgeOlderThan(cutoff);
  };

export type PurgeExpiredTranslations = ReturnType<typeof makePurgeExpiredTranslations>;
