
const { UniqueConstraintError } = require('sequelize');

const Group = require('../models/Group');
const StudentGroup = require('../models/StudentGroup');
const { Student } = require('../models');
const sequelize = require('../config/db');
const { createActivityLog } = require('../utils/createActivityLog');

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
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;          // student id
    const { group_id } = req.body;      // target group id

    const student = await Student.findByPk(id, { transaction: t });
    if (!student) {
      await t.rollback();
      return res.status(404).json({ message: 'Student not found' });
    }

    const target = await Group.findByPk(group_id, { transaction: t });
    if (!target) {
      await t.rollback();
      return res.status(404).json({ message: 'Target group not found' });
    }

    // current link (latest school year), may not exist
    const link = await StudentGroup.findOne({
      where: { student_id: student.id },
      order: [['school_year_id', 'DESC']],
      transaction: t,
    });

    // school year: from the student's link, else from the target group, else the latest overall
    let schoolYearId = link?.school_year_id;
    if (!schoolYearId) {
      const ref =
        (await StudentGroup.findOne({
          where: { group_id: target.id },
          order: [['school_year_id', 'DESC']],
          transaction: t,
        })) ||
        (await StudentGroup.findOne({
          order: [['school_year_id', 'DESC']],
          transaction: t,
        }));
      schoolYearId = ref?.school_year_id;
    }
    if (!schoolYearId) {
      await t.rollback();
      return res.status(400).json({ message: 'No school year found' });
    }

    if (link) {
      if (link.group_id === target.id) {
        await t.rollback();
        return res.status(400).json({ message: 'Student already in this group' });
      }
      const current = await Group.findByPk(link.group_id, { transaction: t });
      if (current && current.level !== target.level) {
        await t.rollback();
        return res.status(400).json({ message: 'Target group must be in the same level' });
      }
    }

    if (target.capacity) {
      const count = await StudentGroup.count({
        where: { group_id: target.id, school_year_id: schoolYearId },
        transaction: t,
      });
      if (count >= target.capacity) {
        await t.rollback();
        return res.status(400).json({ message: 'Target group is full' });
      }
    }

    if (link) {
      await StudentGroup.update(
        { group_id: target.id },
        { where: { student_id: student.id, school_year_id: schoolYearId }, transaction: t }
      );
    } else {
      await StudentGroup.create(
        { student_id: student.id, group_id: target.id, school_year_id: schoolYearId },
        { transaction: t }
      );
    }

    await t.commit();
    await createActivityLog(
    req,
    "update",
    "student",
    student.id,
    `${student.name} ${student.last_name}`,
    `تم نقل التلميذ ${student.name} ${student.last_name} من مجموعة إلى مجموعة أخرى (${target.name})`
);
    res.json({ message: 'Student moved' });
  } catch (error) {
    await t.rollback();
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
