const express = require('express');
const translationsController = require('../controllers/translations.controller');
const authMiddleware = require('../../../shared/middlewares/auth.middleware');

const router = express.Router();

// Todas las rutas de traducciones requieren JWT valido; el controller
// resuelve el user_id desde req.user (con fallback a body/query).
router.use(authMiddleware);

router.post('/', translationsController.create);
router.get('/history', translationsController.list);
router.delete('/:id', translationsController.remove);

module.exports = router;
