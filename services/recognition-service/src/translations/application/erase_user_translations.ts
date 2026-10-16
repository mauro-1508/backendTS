import { TranslationRepository } from '../ports/outbound/translation_repository';

/**
 * Supresion de cuenta (Ley 1581): registra al usuario como borrado y borra de verdad todas sus traducciones, incluidas
 * las que ya estaban marcadas como eliminadas. Idempotente: repetirlo no hace nada.
 */
export const makeEraseUserTranslations = (deps: { translationRepository: TranslationRepository }) =>
  async (userId: number): Promise<number> => deps.translationRepository.eraseUser(userId);

export type EraseUserTranslations = ReturnType<typeof makeEraseUserTranslations>;
