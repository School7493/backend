
const { body, param, query } = require('express-validator');
const validate = require('../middlewares/validate');

const GROUP_NAMES = ['أ', 'ب', 'ج', 'د', 'ه'];

const groupIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('Invalid group ID'),
  validate,
];

const createGroupValidation = [
  body('level')
    .trim()
    .notEmpty()
    .withMessage('Level is required')
    .isLength({ max: 50 })
    .withMessage('Level cannot exceed 50 characters'),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('Group name is required')
    .isIn(GROUP_NAMES)
    .withMessage('Invalid group name'),

  body('capacity')
    .optional({ values: 'null' })
    .custom((value) => value === '' || (
      Number.isInteger(Number(value)) && Number(value) >= 1
    ))
    .withMessage('Capacity must be a positive integer'),

  validate,
];

const updateGroupValidation = [
  ...groupIdValidation.slice(0, 1),
  ...createGroupValidation,
];

const listGroupsValidation = [
  query('level')
    .optional()
    .isString()
    .withMessage('Level must be a string')
    .trim(),

  validate,
];

module.exports = {
  groupIdValidation,
  createGroupValidation,
  updateGroupValidation,
  listGroupsValidation,
};
