import { TranslationRepository } from '../ports/outbound/translation_repository';
import { InvalidTranslationError, translationDomainService } from '../domain/service';
import { Translation } from '../domain/entity';

export const makeListTranslations = (deps: { translationRepository: TranslationRepository }) =>
  async ({
    userId,
    limit,
    offset,
  }: {
    userId: number | null;
    limit?: number | string;
    offset?: number | string;
  }): Promise<Translation[]> => {
    if (!userId) {
      throw new InvalidTranslationError('userId es obligatorio para listar el historial');
    }
    return deps.translationRepository.listByUser({
      userId,
      ...translationDomainService.normalizeListParams({ limit, offset }),
    });
  };
