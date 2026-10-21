
const { UniqueConstraintError } = require('sequelize');

const Group = require('../models/Group');
const StudentGroup = require('../models/StudentGroup');

const getAll = async (req, res, next) => {
  try {
    const where = {};

    if (req.query.level) {
      where.level = req.query.level;
    }

    const groups = await Group.findAll({
      where,
      order: [['level', 'ASC'], ['name', 'ASC']],
    });

    res.json(groups);
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const group = await Group.findByPk(req.params.id);

    if (!group) {
      return res.status(404).json({
        message: 'Group not found',
      });
    }

    res.json(group);
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const { level, name, capacity } = req.body;

    const group = await Group.create({
      level,
      name,
      capacity: capacity === '' || capacity == null
        ? null
        : Number(capacity),
    });

    res.status(201).json({
      message: 'Group created successfully',
      data: group,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({
        message: 'This group already exists in this level',
      });
    }

    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const group = await Group.findByPk(req.params.id);

    if (!group) {
      return res.status(404).json({
        message: 'Group not found',
      });
    }

    const { level, name, capacity } = req.body;

    await group.update({
      level,
      name,
      capacity: capacity === '' || capacity == null
        ? null
        : Number(capacity),
    });

    res.json({
      message: 'Group updated successfully',
      data: group,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({
        message: 'This group already exists in this level',
      });
    }

    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const group = await Group.findByPk(req.params.id);

    if (!group) {
      return res.status(404).json({
        message: 'Group not found',
      });
    }

    const assignments = await StudentGroup.count({
      where: { group_id: group.id },
    });

    if (assignments > 0) {
      return res.status(409).json({
        message: 'Cannot delete a group with student assignments',
      });
    }

    await group.destroy();

    res.json({
      message: 'Group deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
};
