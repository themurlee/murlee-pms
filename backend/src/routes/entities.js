const express = require('express');
const router = express.Router();
const entitiesController = require('../controllers/entitiesController');

router.get('/', entitiesController.getEntities);
router.post('/', entitiesController.createEntity);
router.put('/:id', entitiesController.updateEntity);
router.delete('/:id', entitiesController.deleteEntity);

module.exports = router;
