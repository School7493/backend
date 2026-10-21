
const Student = require('../models/Student');
const Group = require('../models/Group');
const SchoolYear = require('../models/SchoolYear');

const isPositiveInteger = (value) =>
  /^\d+$/.test(String(value)) && Number(value) > 0;

const validateIdParam = (req, res, next) => {
  if (!isPositiveInteger(req.params.id)) {
    return res.status(400).json({
      message: 'Invalid assignment ID',
    });
  }

  next();
};

const validateAssignmentQuery = (req, res, next) => {
  const { group_id, school_year_id, student_id } = req.query;

  for (const [key, value] of Object.entries({
    group_id,
    school_year_id,
    student_id,
  })) {
    if (value !== undefined && !isPositiveInteger(value)) {
      return res.status(400).json({
        message: `${key} must be a positive integer`,
      });
    }
  }

  next();
};

const validateAssignmentBody = async (req, res, next) => {
  try {
    const { student_id, group_id, school_year_id } = req.body;

    for (const [key, value] of Object.entries({
      student_id,
      group_id,
      school_year_id,
    })) {
      if (!isPositiveInteger(value)) {
        return res.status(400).json({
          message: `${key} must be a positive integer`,
        });
      }
    }

    const [student, group, schoolYear] = await Promise.all([
      Student.findByPk(student_id),
      Group.findByPk(group_id),
      SchoolYear.findByPk(school_year_id),
    ]);

    if (!student) {
      return res.status(404).json({
        message: 'Student not found',
      });
    }

    if (!group) {
      return res.status(404).json({
        message: 'Group not found',
      });
    }

    if (!schoolYear) {
      return res.status(404).json({
        message: 'School year not found',
      });
    }

    // Only allow new assignments in the currently open school year.
    const { getActiveSchoolYear } = require('../utils/schoolYear');
    const activeYear = await getActiveSchoolYear();

    if (!activeYear || Number(activeYear.id) !== Number(school_year_id)) {
      return res.status(400).json({
        message: 'Assignments can only be made in the active school year',
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateIdParam,
  validateAssignmentQuery,
  validateAssignmentBody,
};
