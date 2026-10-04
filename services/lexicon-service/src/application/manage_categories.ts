import { CategoryRepository } from '../domain/repository';
import {
  CategoryInUseError, CategoryNameTakenError, CategoryNotFoundError, LexiconValidationError, parseCategoryId,
  validateCategoryDescription, validateCategoryName,
} from '../domain/rules';
import { LexiconResult } from '../ports/inbound/lexicon_service';

type Deps = { categoryRepository: CategoryRepository };

const assertNameFree = async (repo: CategoryRepository, name: string, exceptId?: number) => {
  const same = await repo.findByName(name);
  if (same && same.categoryId !== exceptId) {
    throw new CategoryNameTakenError(name);
  }
};

export const makeListCategories = (deps: Deps) =>
  async (): Promise<LexiconResult> => ({ success: true, data: await deps.categoryRepository.list() });

export const makeCreateCategory = (deps: Deps) =>
  async (input: { name?: unknown; description?: unknown }): Promise<LexiconResult> => {
    const name = validateCategoryName(input.name);
    await assertNameFree(deps.categoryRepository, name);
    const created = await deps.categoryRepository.create({ name, description: validateCategoryDescription(input.description) });
    return { success: true, message: 'Categoría creada', data: created };
  };

export const makeUpdateCategory = (deps: Deps) =>
  async ({ categoryId, changes }: { categoryId: unknown; changes: { name?: unknown; description?: unknown } }): Promise<LexiconResult> => {
    const id = parseCategoryId(categoryId);
    const next: { name?: string; description?: string | null } = {};
    if (changes.name !== undefined) {
      next.name = validateCategoryName(changes.name);
      await assertNameFree(deps.categoryRepository, next.name, id);
    }
    if (changes.description !== undefined) next.description = validateCategoryDescription(changes.description);
    if (next.name === undefined && next.description === undefined) {
      throw new LexiconValidationError('Indica name o description para actualizar');
    }
    const updated = await deps.categoryRepository.update(id, next);
    if (!updated) throw new CategoryNotFoundError(id);
    return { success: true, message: 'Categoría actualizada', data: updated };
  };

export const makeDeleteCategory = (deps: Deps) =>
  async ({ categoryId }: { categoryId: unknown }): Promise<LexiconResult> => {
    const id = parseCategoryId(categoryId);
    if (!(await deps.categoryRepository.findById(id))) throw new CategoryNotFoundError(id);
    if ((await deps.categoryRepository.countSigns(id)) > 0) throw new CategoryInUseError();
    await deps.categoryRepository.delete(id);
    return { success: true, message: 'Categoría eliminada', data: { categoryId: id } };
  };
