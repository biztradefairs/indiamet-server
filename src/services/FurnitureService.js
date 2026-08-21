const { Op } = require('sequelize'); // IMPORTANT: Add this line
const { v4: uuidv4 } = require('uuid');
const cloudinaryService = require('./CloudinaryService');

class FurnitureService {
  constructor() {
    this.Furniture = null;
  }

  async getFurnitureModel() {
    if (!this.Furniture) {
      try {
        const models = require('../models');
        if (!models.getAllModels().Furniture) {
          console.log('🔄 Furniture model not found, initializing models...');
          models.init();
        }
        this.Furniture = models.getModel('Furniture');
        console.log('✅ Furniture model loaded in service');
      } catch (error) {
        console.error('❌ Failed to load Furniture model:', error);
        throw new Error('Furniture model not available');
      }
    }
    return this.Furniture;
  }

  async createFurniture(data, file) {
    try {
      const Furniture = await this.getFurnitureModel();

      let imageUrl = null;
      let cloudinaryPublicId = null;

      // Upload image to Cloudinary if file exists
      if (file) {
        const uploadResult = await cloudinaryService.uploadFile(file.buffer, {
          folder: 'exhibition-furniture',
          resource_type: 'image',
          access_mode: 'public'
        });
        imageUrl = uploadResult.url;
       cloudinaryPublicId = uploadResult.publicId;
      }

      const furniture = await Furniture.create({
        code: data.code.toUpperCase(),
        description: data.description,
        size: data.size || null,
        cost3Days: parseInt(data.cost3Days) || 0,
        category: data.category || 'Furniture',
        inStock: data.inStock === 'true' || data.inStock === true,
        isActive: data.isActive === undefined || data.isActive === ''
          ? true
          : data.isActive === 'true' || data.isActive === true,
        imageUrl,
        cloudinaryPublicId
      });

      return { success: true, data: furniture };
    } catch (error) {
      console.error('Error in createFurniture:', error);
      throw new Error(`Error creating furniture: ${error.message}`);
    }
  }

  async getAllFurniture(filters = {}) {
    try {
      const Furniture = await this.getFurnitureModel();

      const whereClause = {};

      if (filters.category && filters.category !== 'all' && filters.category !== 'undefined') {
        whereClause.category = filters.category;
      }

      if (filters.inStock !== undefined && filters.inStock !== 'undefined') {
        whereClause.inStock = filters.inStock === 'true';
      }

      if (filters.search && filters.search.trim() !== '') {
        whereClause[Op.or] = [
          { description: { [Op.like]: `%${filters.search}%` } },
          { code: { [Op.like]: `%${filters.search}%` } }
        ];
      }

      const furniture = await Furniture.findAll({
        where: whereClause,
        order: [['createdAt', 'DESC']]
      });

      return { success: true, data: furniture };
    } catch (error) {
      console.error('Error in getAllFurniture:', error);
      return { success: true, data: [] };
    }
  }

  async getFurnitureById(id) {
    try {
      const Furniture = await this.getFurnitureModel();

      const furniture = await Furniture.findByPk(id);
      if (!furniture) {
        throw new Error('Furniture not found');
      }
      return { success: true, data: furniture };
    } catch (error) {
      console.error('Error in getFurnitureById:', error);
      throw new Error(`Error fetching furniture: ${error.message}`);
    }
  }

  async updateFurniture(id, updateData, file = null) {
    try {
      const Furniture = await this.getFurnitureModel();

      const furniture = await Furniture.findByPk(id);
      if (!furniture) {
        throw new Error('Furniture not found');
      }

      // Handle image upload if new file is provided
      if (file) {
        // Delete old image from Cloudinary if exists
        if (furniture.cloudinaryPublicId) {
          await cloudinaryService.deleteFile(furniture.cloudinaryPublicId).catch(() => {
            console.log('Failed to delete old image from Cloudinary, but continuing...');
          });
        }

        // Upload new image
        const uploadResult = await cloudinaryService.uploadFile(file.buffer, {
          folder: 'exhibition-furniture',
          resource_type: 'image',
          access_mode: 'public'
        });

        updateData.imageUrl = uploadResult.url;
        updateData.cloudinaryPublicId = uploadResult.publicId;
      }

      // Update fields
      if (updateData.code) updateData.code = updateData.code.toUpperCase();
      if (updateData.cost3Days) updateData.cost3Days = parseInt(updateData.cost3Days);
      if (updateData.inStock !== undefined) {
        updateData.inStock = updateData.inStock === 'true' || updateData.inStock === true;
      }
      if (updateData.isActive !== undefined) {
        updateData.isActive = updateData.isActive === 'true' || updateData.isActive === true;
      }

      await furniture.update(updateData);
      return { success: true, data: furniture };
    } catch (error) {
      console.error('Error in updateFurniture:', error);
      throw new Error(`Error updating furniture: ${error.message}`);
    }
  }

  async deleteFurniture(id) {
    try {
      const Furniture = await this.getFurnitureModel();

      const furniture = await Furniture.findByPk(id);
      if (!furniture) {
        throw new Error('Furniture not found');
      }

      // Delete image from Cloudinary if exists
      if (furniture.cloudinaryPublicId) {
        await cloudinaryService.deleteFile(furniture.cloudinaryPublicId).catch((error) => {
          console.log('Failed to delete from Cloudinary:', error.message);
        });
      }

      await furniture.destroy();
      return { success: true, message: 'Furniture deleted successfully' };
    } catch (error) {
      console.error('Error in deleteFurniture:', error);
      throw new Error(`Error deleting furniture: ${error.message}`);
    }
  }

  async getStatistics() {
    try {
      const Furniture = await this.getFurnitureModel();
      const sequelize = Furniture.sequelize;

      const totalItems = await Furniture.count();
      const inStock = await Furniture.count({ where: { inStock: true } });
      const outOfStock = await Furniture.count({ where: { inStock: false } });

      const categoryStats = await Furniture.findAll({
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('category')), 'count']
        ],
        group: ['category']
      });

      const categories = await Furniture.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('category')), 'category']]
      });

      return {
        success: true,
        data: {
          totalItems,
          inStock,
          outOfStock,
          categories: categories.map(c => c.category),
          categoryStats: categoryStats || []
        }
      };
    } catch (error) {
      console.error('Error in getStatistics:', error);
      return {
        success: true,
        data: {
          totalItems: 0,
          inStock: 0,
          outOfStock: 0,
          categories: [],
          categoryStats: []
        }
      };
    }
  }

  async bulkDeleteFurniture(ids) {
    try {
      const Furniture = await this.getFurnitureModel();
      const results = [];
      const errors = [];

      for (const id of ids) {
        try {
          const furniture = await Furniture.findByPk(id);
          if (furniture) {
            if (furniture.cloudinaryPublicId) {
              await cloudinaryService.deleteFile(furniture.cloudinaryPublicId).catch(() => {});
            }
            await furniture.destroy();
            results.push(id);
          } else {
            errors.push({ id, error: 'Furniture not found' });
          }
        } catch (error) {
          errors.push({ id, error: error.message });
        }
      }

      return { success: true, results, errors };
    } catch (error) {
      console.error('Error in bulkDeleteFurniture:', error);
      throw new Error(`Error bulk deleting furniture: ${error.message}`);
    }
  }
}

module.exports = new FurnitureService();