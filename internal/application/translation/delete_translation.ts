import { TranslationRepository } from '../../ports/outbound/translation_repository';
import { TranslationResult } from '../../ports/inbound/translation_service';

export const makeDeleteTranslation = (deps: { translationRepository: TranslationRepository }) =>
  async ({ translationId, userId }: { translationId: number; userId: number }): Promise<TranslationResult> => {
    if (!translationId || !userId) {
      throw new Error('translationId y userId son obligatorios');
    }
    const result = await deps.translationRepository.softDelete({ translationId, userId });
    if (!result) {
      throw new Error('Traduccion no encontrada');
    }
    return { success: true, message: 'Traduccion eliminada', data: result };
  };
