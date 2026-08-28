const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VisitorPass = sequelize.define('VisitorPass', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    registrationNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    qrToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    countryCode: {
      type: DataTypes.STRING(8),
      defaultValue: '+91'
    },
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'whatsapp'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    pinCode: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    area: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      defaultValue: 'India'
    },
    source: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    interests: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'verified'
    },
    passSentAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'visitor_passes',
    timestamps: true
  });

  return VisitorPass;
};
