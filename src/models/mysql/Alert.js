const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Alert = sequelize.define('Alert', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    type: {
      type: DataTypes.ENUM('error', 'warning', 'info', 'success'),
      allowNull: false
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'medium'
    },
    acknowledged: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    acknowledgedBy: {
      type: DataTypes.UUID
    },
    acknowledgedAt: DataTypes.DATE,
    data: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    expiresAt: DataTypes.DATE
  }, {
    indexes: [
      { fields: ['type'] },
      { fields: ['severity'] },
      { fields: ['acknowledged'] }
    ]
  });

  return Alert;
};
