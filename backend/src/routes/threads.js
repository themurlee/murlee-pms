const express = require('express');
const router = express.Router();
const threadsController = require('../controllers/threadsController');

router.get('/', threadsController.getThreads);
router.post('/', threadsController.postThread);
router.post('/simulate-inbound', threadsController.postSimulateInbound);
router.get('/:id/messages', threadsController.getThreadMessages);
router.post('/:id/messages', threadsController.postThreadMessage);
router.patch('/:id', threadsController.patchThread);

module.exports = router;
