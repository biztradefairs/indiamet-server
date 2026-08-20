const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Payment = sequelize.define('Payment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false
    },
    invoiceId: {
      type: DataTypes.UUID
    },
    exhibitorId: {
      type: DataTypes.UUID
    },
    userId: {
      type: DataTypes.UUID
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
      defaultValue: 'pending'
    },
    method: {
      type: DataTypes.ENUM('credit_card', 'bank_transfer', 'check', 'cash', 'online'),
      allowNull: false
    },
    transactionId: {
      type: DataTypes.STRING
    },
    date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    dueDate: {
      type: DataTypes.DATE
    },
    processedBy: {
      type: DataTypes.STRING
    },
    notes: {
      type: DataTypes.TEXT
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    source: {
      type: DataTypes.STRING,
      defaultValue: 'exhibition'
    }
  }, {
    indexes: [
      { fields: ['invoiceNumber'] },
      { fields: ['status'] },
      { fields: ['method'] },
      { fields: ['date'] },
      { fields: ['exhibitorId'] }
    ]
  });

  return Payment;
};
