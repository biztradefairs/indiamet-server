const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FloorPlan = sequelize.define('FloorPlan', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Exhibition Floor Plan'
    },
    baseImageUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fileType: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    originalFileName: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    cloudinaryPublicId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    booths: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '[]',
      get() {
        const raw = this.getDataValue('booths');
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        try {
          return JSON.parse(raw);
        } catch {
          return [];
        }
      },
      set(value) {
        this.setDataValue('booths', typeof value === 'string' ? value : JSON.stringify(value || []));
      }
    },
    imageWidth: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    imageHeight: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    referencePoints: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue('referencePoints');
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        try {
          return JSON.parse(raw);
        } catch {
          return [];
        }
      },
      set(value) {
        this.setDataValue('referencePoints', typeof value === 'string' ? value : JSON.stringify(value || []));
      }
    },
    createdBy: {
      type: DataTypes.STRING,
      allowNull: true
    },
    updatedBy: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isMaster: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    }
  }, {
    tableName: 'floor_plans',
    timestamps: true,
    underscored: true
  });

  return FloorPlan;
};
