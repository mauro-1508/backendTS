import { NewResource, SignChanges, SignType } from '../../domain/entity';

export interface LexiconResult {
  success: boolean;
  message?: string;
  data?: unknown;
  /** Paginación de los listados. */
  meta?: { limit: number; offset: number };
}

/** Cuerpo de creación tal como llega (sin validar). */
export interface CreateSignInput {
  code: string;
  type?: SignType;
  letter?: string | null;
  language?: string;
  category?: string;
  categoryId?: number;
  localizations?: unknown;
  /** Atajos de la localización ES. */
  word?: string;
  description?: string | null;
  animated?: boolean;
  displayOrder?: number;
}

export type UpdateSignInput = Omit<SignChanges, 'categoryId'> & {
  category?: string;
  categoryId?: number;
  word?: string;
  description?: string | null;
};

export interface LexiconService {
  list(input: { type?: string; language?: string; category?: string; q?: string; lang?: string;
    includeInactive?: boolean; status?: string; limit?: unknown; offset?: unknown;
  }): Promise<LexiconResult>;
  alphabet(input: { language?: string; lang?: string }): Promise<LexiconResult>;
  get(input: { code: string; lang?: string; includeInactive?: boolean }): Promise<LexiconResult>;
  create(input: { sign: CreateSignInput; userId: number | null }): Promise<LexiconResult>;
  update(input: { code: string; changes: UpdateSignInput; userId: number | null }): Promise<LexiconResult>;
  publish(input: { code: string; userId: number | null }): Promise<LexiconResult>;
  deactivate(input: { code: string; userId: number | null }): Promise<LexiconResult>;
  upsertLocalization(input: {
    code: string; uiLanguage: string; localization: { name?: unknown; meaning?: unknown; description?: unknown };
  }): Promise<LexiconResult>;
  addResource(input: { code: string; resource: NewResource }): Promise<LexiconResult>;
  removeResource(input: { code: string; resourceId: number }): Promise<LexiconResult>;
  listCategories(): Promise<LexiconResult>;
  createCategory(input: { name?: unknown; description?: unknown }): Promise<LexiconResult>;
  updateCategory(input: { categoryId: unknown; changes: { name?: unknown; description?: unknown } }): Promise<LexiconResult>;
  deleteCategory(input: { categoryId: unknown }): Promise<LexiconResult>;
}
