const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    type: {
      type: DataTypes.ENUM(
        'WELCOME',
        'ARTICLE_PUBLISHED',
        'EXHIBITOR_STATUS_CHANGED',
        'PAYMENT_RECEIVED',
        'INVOICE_CREATED',
        'SYSTEM_ALERT'
      ),
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    data: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    readAt: DataTypes.DATE,
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high'),
      defaultValue: 'medium'
    },
    expiresAt: DataTypes.DATE
  }, {
    indexes: [
      { fields: ['userId', 'read'] },
      { fields: ['expiresAt'] }
    ]
  });

  return Notification;
};
