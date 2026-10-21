
const express = require('express');
const router = express.Router();

const controller = require('../controllers/groupController');

const {
  groupIdValidation,
  createGroupValidation,
  updateGroupValidation,
  listGroupsValidation,
} = require('../validators/groupValidator');

router.get('/', listGroupsValidation, controller.getAll);

router.get('/:id', groupIdValidation, controller.getById);

router.post('/', createGroupValidation, controller.create);

router.put('/:id', updateGroupValidation, controller.update);

router.delete('/:id', groupIdValidation, controller.remove);

module.exports = router;
