import { TranslationRepository } from '../ports/outbound/translation_repository';

export const makeDeleteTranslation = (deps: { translationRepository: TranslationRepository }) =>
  async ({ translationId, userId }: { translationId: number; userId: number }): Promise<{ translationId: number }> => {
    if (!translationId || !userId) {
      throw new Error('translationId y userId son obligatorios');
    }
    const result = await deps.translationRepository.softDelete({ translationId, userId });
    if (!result) {
      throw new Error('Traduccion no encontrada');
    }
    return result;
  };
