const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Article = sequelize.define('Article', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false
    },
    excerpt: {
      type: DataTypes.TEXT
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING
    },
    status: {
      type: DataTypes.ENUM('published', 'draft'),
      defaultValue: 'draft'
    },
    author: {
      type: DataTypes.STRING
    },
    views: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    image: {
      type: DataTypes.STRING
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    indexes: [
      { fields: ['slug'] },
      { fields: ['category'] },
      { fields: ['status'] }
    ]
  });

  return Article;
};
