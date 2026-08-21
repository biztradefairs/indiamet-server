const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Furniture = sequelize.define('Furniture', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    size: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cost3Days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Furniture'
    },
    inStock: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cloudinaryPublicId: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'Furniture',
    timestamps: true,
    indexes: [
      {
        fields: ['code']
      },
      {
        fields: ['category']
      },
      {
        fields: ['inStock']
      },
      {
        fields: ['isActive']
      }
    ]
  });

  return Furniture;
};