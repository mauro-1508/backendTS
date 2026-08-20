import { NewTranslation, Translation } from './entity';

export interface TranslationRepository {
  create(translation: NewTranslation): Promise<Translation>;
  listByUser(params: { userId: number; limit: number; offset: number }): Promise<Translation[]>;
  softDelete(params: { translationId: number; userId: number }): Promise<{ translationId: number } | null>;
}
