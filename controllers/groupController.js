
const { UniqueConstraintError } = require('sequelize');

const Group = require('../models/Group');
const StudentGroup = require('../models/StudentGroup');
const { Student } = require('../models');

const getAll = async (req, res, next) => {
  try {
    const where = {};

    if (req.query.level) {
      where.level = req.query.level;
    }

const groups = await Group.findAll({
  where,
  order: [
    ['level', 'ASC'],
    ['name', 'ASC'],
  ],
  include: [
    {
      model: Student,
      attributes:["id","name","last_name"],
      through: { attributes: [] },
    },
  ],
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

const moveStudent = async (req, res) => {
  try {
    const { id } = req.params;          // student id
    const { group_id } = req.body;      // target group id

    const assoc = Group.associations?.students;
    if (!assoc) {
      return res.status(500).json({ message: 'Group.students association not found' });
    }

    console.log('moveStudent assoc:', {
      type: assoc.associationType,       // HasMany or BelongsToMany
      fk: assoc.foreignKey,
      through: assoc.through?.model?.name,
      studentColumns: Object.keys(Student.rawAttributes),
    });

    const student = await Student.findByPk(id);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const target = await Group.findByPk(group_id);
    if (!target) return res.status(404).json({ message: 'Target group not found' });

    // find the group the student is in now
    const currentGroups = await Group.findAll({
      include: [{ model: Student, as: 'students', where: { id: student.id }, attributes: ['id'] }],
    });
    const current = currentGroups[0] ?? null;

    if (current?.id === target.id) {
      return res.status(400).json({ message: 'Student already in this group' });
    }
    if (current && current.level !== target.level) {
      return res.status(400).json({ message: 'Target group must be in the same level' });
    }

    if (target.capacity) {
      const count = await target.countStudents({ where: { is_deleted: false } });
      if (count >= target.capacity) {
        return res.status(400).json({ message: 'Target group is full' });
      }
    }

    if (current) await current.removeStudent(student);
    await target.addStudent(student);

    res.json({ message: 'Student moved', type: assoc.associationType });
  } catch (error) {
    console.error('moveStudent error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  moveStudent
};
