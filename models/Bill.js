
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Bill = sequelize.define('bills', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },

  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  category: {
    type: DataTypes.ENUM(
      'electricity',
      'water',
      'internet',
      'telephone',
      'rent',
      'other'
    ),
    allowNull: false,
    defaultValue: 'other',
  },

  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  amount: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false,
  },

  bill_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },

  due_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },

  paid_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },

  status: {
    type: DataTypes.ENUM(
      'non payé',
      'payé',
      'partially_paid'
    ),
    allowNull: false,
    defaultValue: 'non payé',
  },

  paid_amount: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false,
    defaultValue: 0,
  },


  reference_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  receipt_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },

}, {
  timestamps: true,
  indexes: [
    { fields: ['category'] },
    { fields: ['status'] },
    { fields: ['bill_date'] },
    { fields: ['due_date'] },
  ],
});

module.exports = Bill;
