const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID
    },
    userEmail: DataTypes.STRING,
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    details: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    service: {
      type: DataTypes.STRING,
      defaultValue: 'admin-service'
    },
    ipAddress: DataTypes.STRING,
    userAgent: DataTypes.TEXT
  }, {
    indexes: [
      { fields: ['action'] },
      { fields: ['userId'] },
      { fields: ['timestamp'] },
      { fields: ['service'] }
    ]
  });

  return AuditLog;
};
