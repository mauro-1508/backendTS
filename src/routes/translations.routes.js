const express = require('express');
const translationsController = require('../controllers/translations.controller');

const router = express.Router();

router.post('/', translationsController.create);
router.get('/history', translationsController.list);
router.delete('/:id', translationsController.remove);

module.exports = router;
