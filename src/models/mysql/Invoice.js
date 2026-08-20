const { DataTypes } = require('sequelize');
const database = require('../../config/database');

const getInvoiceModel = () => {
  const sequelize = database.getConnection('mysql');
  
  if (!sequelize) {
    throw new Error(
      'Postgres connection not initialized. Call database.connect() before loading models.'
    );
  }

  return sequelize.define('Invoice', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    invoiceNumber: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false
    },

    exhibitorId: {
      type: DataTypes.UUID,
      allowNull: true
    },

    company: {
      type: DataTypes.STRING,
      allowNull: false
    },

    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },

    status: {
      type: DataTypes.ENUM('draft', 'pending', 'paid', 'overdue', 'cancelled'),
      defaultValue: 'draft'
    },

    dueDate: {
      type: DataTypes.DATE,
      allowNull: false
    },

    issueDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },

    paidDate: {
      type: DataTypes.DATE,
      allowNull: true
    },

    items: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    terms: {
      type: DataTypes.TEXT,
      allowNull: true
    }

    // ❌ REMOVED metadata (only keep if DB has it)
  }, {
    tableName: 'invoices',

    // 🔥 CRITICAL FIX
    timestamps: false,

    indexes: [
      { fields: ['invoiceNumber'] },
      { fields: ['status'] },
      { fields: ['dueDate'] },
      { fields: ['exhibitorId'] }
    ]
  });
};

module.exports = getInvoiceModel;