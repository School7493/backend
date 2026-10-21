
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const StudentGroup = sequelize.define(
  'StudentGroup',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    student_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    group_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    school_year_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: 'student_groups',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['student_id', 'school_year_id'],
        name: 'unique_student_school_year',
      },
    ],
  }
);

module.exports = StudentGroup;
