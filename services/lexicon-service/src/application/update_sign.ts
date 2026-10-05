import { Localization } from '../domain/entity';
import { CategoryRepository, LexiconRepository } from '../domain/repository';
import { normalizeCode, SignNotFoundError, validateChanges, validateLocalization } from '../domain/rules';
import { LexiconResult, UpdateSignInput } from '../ports/inbound/lexicon_service';
import { resolveCategoryId } from './resolve_category';

/**
 * Edita la seña. Ni `code` ni `status` cambian aquí (el estado va por publish/DELETE).
 * `word`/`description` sueltos editan la localización ES (compatibilidad).
 */
export const makeUpdateSign = (deps: {
  lexiconRepository: LexiconRepository;
  categoryRepository: CategoryRepository;
}) =>
  async ({ code, changes, userId }: { code: string; changes: UpdateSignInput; userId: number | null }): Promise<LexiconResult> => {
    const normalized = normalizeCode(code);
    const current = await deps.lexiconRepository.findByCode(normalized, { includeInactive: true });
    if (!current) throw new SignNotFoundError(code);

    const categoryId = await resolveCategoryId(deps.categoryRepository, changes);
    const valid = validateChanges(current, {
      type: changes.type,
      letter: changes.letter,
      language: changes.language,
      animated: changes.animated,
      displayOrder: changes.displayOrder,
      categoryId,
    });

    let localization: Localization | null = null;
    if (changes.word !== undefined || changes.description !== undefined) {
      const es = current.localizations?.find(l => l.uiLanguage === 'ES');
      localization = validateLocalization({
        uiLanguage: 'ES',
        name: changes.word ?? es?.name,
        meaning: es?.meaning,
        description: changes.description !== undefined ? changes.description : es?.description,
      });
    }

    const updated = await deps.lexiconRepository.update(normalized, valid, userId, localization ?? undefined);
    if (!updated) throw new SignNotFoundError(code);
    return { success: true, message: 'Seña actualizada', data: updated };
  };
