const translationsService = require('../services/translations.service');

/**
 * El user_id sale del JWT verificado por authMiddleware (req.user).
 * Se mantiene el fallback a body/query solo para pruebas manuales con
 * herramientas tipo curl/Postman.
 */
const resolveUserId = (req) => {
  if (req.user && req.user.user_id) return req.user.user_id;
  if (req.body && req.body.user_id) return Number(req.body.user_id);
  if (req.query && req.query.user_id) return Number(req.query.user_id);
  return null;
};

const translationsController = {
  create: async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const { inputText, outputText, type, confidence, source } = req.body;
      const result = await translationsService.create({
        userId,
        inputText,
        outputText,
        type,
        confidence,
        source,
      });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  list: async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const { limit, offset } = req.query;
      const result = await translationsService.list({ userId, limit, offset });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const userId = resolveUserId(req);
      const translationId = Number(req.params.id);
      const result = await translationsService.remove({ translationId, userId });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  },
};

module.exports = translationsController;
