
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Group = sequelize.define(
  'Group',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    level: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Level is required',
        },
      },
    },

    name: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Group name is required',
        },
        isIn: {
          args: [['أ', 'ب', 'ج', 'د', 'و']],
          msg: 'Invalid group name',
        },
      },
    },

    capacity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: {
        min: {
          args: [1],
          msg: 'Capacity must be at least 1',
        },
        isInt: {
          msg: 'Capacity must be an integer',
        },
      },
    },
  },
  {
    tableName: 'groups',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['level', 'name'],
        name: 'unique_group_level_name',
      },
    ],
  }
);

module.exports = Group;
