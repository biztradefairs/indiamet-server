const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invoice = sequelize.define('Invoice', {
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
      type: DataTypes.STRING,
      defaultValue: 'pending'
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
  }, {
    tableName: 'invoices',
    timestamps: false
  });

  return Invoice;
};
