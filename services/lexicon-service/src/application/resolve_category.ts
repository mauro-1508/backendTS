import { CategoryRepository } from '../domain/repository';
import { CategoryNotFoundError, LexiconValidationError, parseCategoryId } from '../domain/rules';

/** Acepta `categoryId` o el nombre en `category`. Devuelve undefined si no vino ninguno. */
export const resolveCategoryId = async (
  categoryRepository: CategoryRepository,
  ref: { categoryId?: unknown; category?: unknown },
): Promise<number | undefined> => {
  if (ref.categoryId !== undefined && ref.categoryId !== null) {
    const id = parseCategoryId(ref.categoryId);
    if (!(await categoryRepository.findById(id))) throw new CategoryNotFoundError(id);
    return id;
  }
  if (ref.category !== undefined && ref.category !== null) {
    const name = String(ref.category).trim();
    if (!name) throw new LexiconValidationError('category no puede estar vacía');
    const found = await categoryRepository.findByName(name);
    if (!found) throw new CategoryNotFoundError(name);
    return found.categoryId;
  }
  return undefined;
};
