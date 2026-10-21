
const express = require('express');
const router = express.Router();

const controller = require('../controllers/StudentGroupController');

const {
  validateIdParam,
  validateAssignmentQuery,
  validateAssignmentBody,
} = require('../validators/studentGroupValidator');

router.get(
  '/',
  validateAssignmentQuery,
  controller.getAll
);

router.get(
  '/:id',
  validateIdParam,
  controller.getById
);

router.post(
  '/',
  validateAssignmentBody,
  controller.create
);

router.put(
  '/:id',
  validateIdParam,
  validateAssignmentBody,
  controller.update
);

router.delete(
  '/:id',
  validateIdParam,
  controller.remove
);

module.exports = router;
