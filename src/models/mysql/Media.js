const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Media = sequelize.define('Media', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    filename: { type: DataTypes.STRING, allowNull: false },
    originalName: { type: DataTypes.STRING, allowNull: false },
    mimeType: { type: DataTypes.STRING, allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false },
    path: { type: DataTypes.STRING, allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
    type: {
      type: DataTypes.ENUM('image', 'video', 'document', 'audio', 'other'),
      allowNull: false
    },
    dimensions: DataTypes.STRING,
    duration: DataTypes.INTEGER,
    userId: DataTypes.UUID,
    uploadedBy: DataTypes.STRING,
    description: DataTypes.TEXT,
    tags: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    timestamps: true,
    indexes: [
      { fields: ['filename'] },
      { fields: ['type'] },
      { fields: ['userId'] }
    ]
  });

  return Media;
};
