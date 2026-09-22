import { TranslationRepository } from '../../ports/outbound/translation_repository';
import { translationDomainService } from '../../domain/translation/service';
import { TranslationResult } from '../../ports/inbound/translation_service';

export const makeListTranslations = (deps: { translationRepository: TranslationRepository }) =>
  async ({
    userId,
    limit,
    offset,
  }: {
    userId: number | null;
    limit?: number | string;
    offset?: number | string;
  }): Promise<TranslationResult> => {
    if (!userId) {
      throw new Error('userId es obligatorio para listar el historial');
    }
    const items = await deps.translationRepository.listByUser({
      userId,
      ...translationDomainService.normalizeListParams({ limit, offset }),
    });
    return { success: true, data: items };
  };
