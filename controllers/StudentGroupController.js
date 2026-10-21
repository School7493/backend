
const { UniqueConstraintError } = require('sequelize');

const StudentGroup = require('../models/StudentGroup');
const Student = require('../models/Student');
const Group = require('../models/Group');
const SchoolYear = require('../models/SchoolYear');

const includes = [
  { model: Student },
  { model: Group },
  { model: SchoolYear },
];

// GET /api/student-groups
const getAll = async (req, res, next) => {
  try {
    const where = {};

    for (const key of ['student_id', 'group_id', 'school_year_id']) {
      if (req.query[key] !== undefined) {
        where[key] = Number(req.query[key]);
      }
    }

    const assignments = await StudentGroup.findAll({
      where,
      include: includes,
      order: [['createdAt', 'DESC']],
    });

    res.json(assignments);
  } catch (error) {
    next(error);
  }
};

// GET /api/student-groups/:id
const getById = async (req, res, next) => {
  try {
    const assignment = await StudentGroup.findByPk(req.params.id, {
      include: includes,
    });

    if (!assignment) {
      return res.status(404).json({
        message: 'Student group assignment not found',
      });
    }

    res.json(assignment);
  } catch (error) {
    next(error);
  }
};

// POST /api/student-groups
const create = async (req, res, next) => {
  try {
    const { student_id, group_id, school_year_id } = req.body;

    const existing = await StudentGroup.findOne({
      where: { student_id, school_year_id },
    });

    if (existing) {
      return res.status(409).json({
        message: 'This student already has a group in this school year',
      });
    }

    const assignment = await StudentGroup.create({
      student_id,
      group_id,
      school_year_id,
    });

    const result = await StudentGroup.findByPk(assignment.id, {
      include: includes,
    });

    res.status(201).json({
      message: 'Student assigned to group successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({
        message: 'This student already has a group in this school year',
      });
    }

    next(error);
  }
};

// PUT /api/student-groups/:id
const update = async (req, res, next) => {
  try {
    const assignment = await StudentGroup.findByPk(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        message: 'Student group assignment not found',
      });
    }

    // Do not move an old assignment into another school year.
    if (
      Number(assignment.school_year_id) !==
      Number(req.body.school_year_id)
    ) {
      return res.status(400).json({
        message: 'The school year of an assignment cannot be changed',
      });
    }

    const existing = await StudentGroup.findOne({
      where: {
        student_id: req.body.student_id,
        school_year_id: req.body.school_year_id,
        id: { [require('sequelize').Op.ne]: assignment.id },
      },
    });

    if (existing) {
      return res.status(409).json({
        message: 'This student already has a group in this school year',
      });
    }

    await assignment.update({
      student_id: req.body.student_id,
      group_id: req.body.group_id,
    });

    const result = await StudentGroup.findByPk(assignment.id, {
      include: includes,
    });

    res.json({
      message: 'Student group assignment updated successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({
        message: 'This student already has a group in this school year',
      });
    }

    next(error);
  }
};

// DELETE /api/student-groups/:id
const remove = async (req, res, next) => {
  try {
    const assignment = await StudentGroup.findByPk(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        message: 'Student group assignment not found',
      });
    }

    await assignment.destroy();

    res.json({
      message: 'Student group assignment removed successfully',
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
