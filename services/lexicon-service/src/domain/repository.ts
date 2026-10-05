import {
  Category, CategorySummary, Localization, MultimediaResource, NewResource, NewSign, Sign, SignChanges,
  SignFilter, SignStatus, UiLanguage,
} from './entity';

export interface FindSignOptions {
  lang?: UiLanguage;
  includeInactive?: boolean;
}

export interface LexiconRepository {
  list(filter: SignFilter): Promise<Sign[]>;
  findByCode(code: string, options?: FindSignOptions): Promise<Sign | null>;
  /** Crea la sena (en DRAFT) y sus localizaciones en una sola transaccion. */
  create(sign: NewSign, userId: number | null): Promise<Sign>;
  /** Con `localization`, la seña y esa localización se guardan en una sola transacción. */
  update(
    code: string, changes: SignChanges, userId: number | null, localization?: Localization,
  ): Promise<Sign | null>;
  setStatus(code: string, status: SignStatus, userId: number | null): Promise<Sign | null>;
  /** Crea o reemplaza la localizacion de ese idioma. null si la sena no existe. */
  upsertLocalization(code: string, localization: Localization): Promise<Localization | null>;
  hasResourceAt(code: string, displayOrder: number): Promise<boolean>;
  addResource(code: string, resource: NewResource): Promise<MultimediaResource | null>;
  removeResource(code: string, resourceId: number): Promise<boolean>;
}

export interface CategoryRepository {
  list(): Promise<CategorySummary[]>;
  findById(categoryId: number): Promise<Category | null>;
  findByName(name: string): Promise<Category | null>;
  create(input: { name: string; description: string | null }): Promise<Category>;
  update(categoryId: number, changes: { name?: string; description?: string | null }): Promise<Category | null>;
  /** Cuenta senas en cualquier estado. */
  countSigns(categoryId: number): Promise<number>;
  delete(categoryId: number): Promise<boolean>;
}
