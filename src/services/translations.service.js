const translationsRepository = require('../repositories/translations.repository');

const VALID_TYPES = new Set(['texto_sena', 'sena_texto', 'voz_sena']);

const translationsService = {
  create: async ({ userId, inputText, outputText, type, confidence, source }) => {
    if (!outputText || typeof outputText !== 'string' || !outputText.trim()) {
      throw new Error('outputText es obligatorio');
    }
    if (!type || !VALID_TYPES.has(type)) {
      throw new Error(`type invalido. Valores permitidos: ${[...VALID_TYPES].join(', ')}`);
    }
    if (confidence != null && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
      throw new Error('confidence debe ser un numero entre 0 y 1');
    }

    const safeInput = (inputText && String(inputText).trim()) || outputText.trim();
    const created = await translationsRepository.create({
      userId,
      inputText: safeInput,
      outputText: outputText.trim(),
      type,
      confidence,
      source,
    });

    return { success: true, message: 'Traduccion guardada', data: created };
  },

  list: async ({ userId, limit, offset }) => {
    if (!userId) {
      throw new Error('userId es obligatorio para listar el historial');
    }
    const items = await translationsRepository.listByUser({
      userId,
      limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
      offset: Math.max(Number(offset) || 0, 0),
    });
    return { success: true, data: items };
  },

  remove: async ({ translationId, userId }) => {
    if (!translationId || !userId) {
      throw new Error('translationId y userId son obligatorios');
    }
    const result = await translationsRepository.softDelete({ translationId, userId });
    if (!result) {
      throw new Error('Traduccion no encontrada');
    }
    return { success: true, message: 'Traduccion eliminada', data: result };
  },
};

module.exports = translationsService;
