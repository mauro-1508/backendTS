import { SignType } from '../domain/entity';
import { CategoryRepository, LexiconRepository } from '../domain/repository';
import {
  assertCode, assertLetterMatchesType, assertSignType, buildLocalizations, CodeTakenError,
  LexiconValidationError, parseAnimated, parseDisplayOrder, parseSignLanguage,
} from '../domain/rules';
import { CreateSignInput, LexiconResult } from '../ports/inbound/lexicon_service';
import { resolveCategoryId } from './resolve_category';

const DEFAULT_DISPLAY_ORDER = 1000;

/** HU-LEX-006: toda seña nace en DRAFT; se publica aparte (`publish_sign`). */
export const makeCreateSign = (deps: {
  lexiconRepository: LexiconRepository;
  categoryRepository: CategoryRepository;
}) =>
  async ({ sign, userId }: { sign: CreateSignInput; userId: number | null }): Promise<LexiconResult> => {
    const code = assertCode(sign.code);
    const type: SignType = assertSignType(sign.type ?? 'WORD');
    const letter = sign.letter ? String(sign.letter).trim().toUpperCase() : null;
    assertLetterMatchesType(type, letter);
    const localizations = buildLocalizations(sign);

    const categoryId = await resolveCategoryId(deps.categoryRepository, sign);
    if (categoryId === undefined) {
      throw new LexiconValidationError('La categoría es obligatoria (category o categoryId)');
    }
    if (await deps.lexiconRepository.findByCode(code, { includeInactive: true })) {
      throw new CodeTakenError(code);
    }

    const created = await deps.lexiconRepository.create({
      code,
      type,
      letter,
      language: parseSignLanguage(sign.language),
      categoryId,
      animated: sign.animated === undefined ? false : parseAnimated(sign.animated),
      displayOrder: sign.displayOrder === undefined ? DEFAULT_DISPLAY_ORDER : parseDisplayOrder(sign.displayOrder),
      localizations,
    }, userId);
    return { success: true, message: 'Seña creada como borrador', data: created };
  };
