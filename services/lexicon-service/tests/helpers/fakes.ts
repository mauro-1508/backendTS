import {
  Category, CategorySummary, Localization, MultimediaResource, NewResource, NewSign, Sign, SignChanges,
  SignFilter, SignStatus,
} from '../../src/domain/entity';
import { CategoryRepository, FindSignOptions, LexiconRepository } from '../../src/domain/repository';

/** Repositorios falsos en memoria que implementan los puertos del dominio lexicon. */
export class FakeCategoryRepository implements CategoryRepository {
  categories: Category[] = [];
  /** Lo fija la prueba para simular cuántas señas tiene cada categoría. */
  signCounts = new Map<number, number>();
  private nextId = 1;
  deleted: number[] = [];

  seed(name: string, description: string | null = null): Category {
    const c = { categoryId: this.nextId++, name, description };
    this.categories.push(c);
    return c;
  }
  async list(): Promise<CategorySummary[]> {
    return this.categories.map(c => ({ ...c, signCount: this.signCounts.get(c.categoryId) ?? 0 }));
  }
  async findById(id: number) { return this.categories.find(c => c.categoryId === id) ?? null; }
  async findByName(name: string) {
    return this.categories.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async create(input: { name: string; description: string | null }) { return this.seed(input.name, input.description); }
  async update(id: number, changes: { name?: string; description?: string | null }) {
    const c = this.categories.find(x => x.categoryId === id);
    if (!c) return null;
    Object.assign(c, changes);
    return c;
  }
  async countSigns(id: number) { return this.signCounts.get(id) ?? 0; }
  async delete(id: number) {
    const before = this.categories.length;
    this.categories = this.categories.filter(c => c.categoryId !== id);
    this.deleted.push(id);
    return this.categories.length < before;
  }
}

export class FakeLexiconRepository implements LexiconRepository {
  signs: Sign[] = [];
  private nextId = 1;
  private nextResourceId = 1;
  /** Registro de llamadas, para verificar lo que el caso de uso le pide al puerto. */
  lastListFilter?: SignFilter;
  lastFindOptions?: FindSignOptions;
  created: { sign: NewSign; userId: number | null }[] = [];
  updates: { code: string; changes: SignChanges; userId: number | null; localization?: Localization }[] = [];
  statusCalls: { code: string; status: SignStatus; userId: number | null }[] = [];

  constructor(private categories: FakeCategoryRepository) {}

  /** Inserta una seña ya hecha (para preparar escenarios). */
  seed(partial: Partial<Sign> & { code: string }): Sign {
    const sign: Sign = {
      lexiconId: this.nextId++, word: partial.code, meaning: null, type: 'WORD', letter: null, language: 'LSC',
      categoryId: 1, category: 'Saludos', description: null, animated: false, displayOrder: 1000,
      status: 'ACTIVE', resources: [],
      localizations: [{ uiLanguage: 'ES', name: partial.code, meaning: null, description: null }],
      createdAt: new Date(0), updatedAt: new Date(0), ...partial,
    };
    this.signs.push(sign);
    return sign;
  }
  private get(code: string) { return this.signs.find(s => s.code === code); }

  async list(filter: SignFilter) {
    this.lastListFilter = filter;
    return this.signs.filter(s => {
      if (filter.status) { if (s.status !== filter.status) return false; }
      else if (!filter.includeInactive && s.status !== 'ACTIVE') return false;
      if (filter.type && s.type !== filter.type) return false;
      if (filter.language && s.language !== filter.language) return false;
      if (filter.category && s.category !== filter.category) return false;
      if (filter.q && !s.word.toLowerCase().includes(filter.q.toLowerCase())) return false;
      return true;
    });
  }
  async findByCode(code: string, options?: FindSignOptions) {
    this.lastFindOptions = options;
    const s = this.get(code);
    if (!s) return null;
    if (s.status !== 'ACTIVE' && !options?.includeInactive) return null;
    return s;
  }
  async create(sign: NewSign, userId: number | null) {
    this.created.push({ sign, userId });
    const cat = this.categories.categories.find(c => c.categoryId === sign.categoryId);
    return this.seed({
      code: sign.code, type: sign.type, letter: sign.letter, language: sign.language, categoryId: sign.categoryId,
      category: cat?.name ?? '', animated: sign.animated, displayOrder: sign.displayOrder,
      word: sign.localizations.find(l => l.uiLanguage === 'ES')?.name ?? sign.code,
      localizations: sign.localizations, status: 'DRAFT',
    });
  }
  async update(code: string, changes: SignChanges, userId: number | null, localization?: Localization) {
    this.updates.push({ code, changes, userId, localization });
    const s = this.get(code);
    if (!s) return null;
    Object.assign(s, changes);
    if (localization) {
      s.localizations = [...(s.localizations ?? []).filter(l => l.uiLanguage !== localization.uiLanguage), localization];
      if (localization.uiLanguage === 'ES') { s.word = localization.name; s.description = localization.description; }
    }
    return s;
  }
  async setStatus(code: string, status: SignStatus, userId: number | null) {
    this.statusCalls.push({ code, status, userId });
    const s = this.get(code);
    if (!s) return null;
    s.status = status;
    return s;
  }
  async upsertLocalization(code: string, localization: Localization) {
    const s = this.get(code);
    if (!s) return null;
    s.localizations = [...(s.localizations ?? []).filter(l => l.uiLanguage !== localization.uiLanguage), localization];
    return localization;
  }
  async hasResourceAt(code: string, order: number) {
    return !!this.get(code)?.resources.some(r => r.displayOrder === order);
  }
  async addResource(code: string, resource: NewResource): Promise<MultimediaResource | null> {
    const s = this.get(code);
    if (!s) return null;
    const r: MultimediaResource = {
      resourceId: this.nextResourceId++, type: resource.type, url: resource.url, mimeType: resource.mimeType ?? null,
      displayOrder: resource.displayOrder ?? s.resources.length + 1, description: resource.description ?? null,
    };
    s.resources.push(r);
    return r;
  }
  async removeResource(code: string, resourceId: number) {
    const s = this.get(code);
    if (!s) return false;
    const before = s.resources.length;
    s.resources = s.resources.filter(r => r.resourceId !== resourceId);
    return s.resources.length < before;
  }
}

export const makeRepos = () => {
  const categoryRepository = new FakeCategoryRepository();
  const lexiconRepository = new FakeLexiconRepository(categoryRepository);
  return { categoryRepository, lexiconRepository };
};

/** Ejecuta `fn` y devuelve el error lanzado (falla si no lanza). */
export const catchError = async (fn: () => Promise<unknown> | unknown): Promise<any> => {
  try { await fn(); } catch (e) { return e; }
  throw new Error('Se esperaba que lanzara un error y no lanzó');
};
