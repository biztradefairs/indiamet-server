const furnitureService = require('../services/FurnitureService');

class FurnitureController {
  // Create new furniture
  async createFurniture(req, res) {
    try {
      console.log('Creating furniture with data:', {
        body: req.body,
        file: req.file ? {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        } : 'No file'
      });

      const result = await furnitureService.createFurniture(req.body, req.file);
      
      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Furniture created successfully'
      });
    } catch (error) {
      console.error('Error in createFurniture:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to create furniture'
      });
    }
  }

  // Get all furniture
  async getAllFurniture(req, res) {
    try {
      const filters = {
        category: req.query.category,
        inStock: req.query.inStock,
        search: req.query.search
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      console.log('Fetching furniture with filters:', filters);
      
      const result = await furnitureService.getAllFurniture(filters);
      
      res.json({
        success: true,
        data: result.data,
        count: result.data.length,
        filters
      });
    } catch (error) {
      console.error('Error in getAllFurniture:', error);
      res.status(500).json({ 
        success: false, 
        data: [],
        message: error.message || 'Failed to fetch furniture'
      });
    }
  }

  // Get single furniture by ID
  async getFurniture(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Furniture ID is required'
        });
      }

      const result = await furnitureService.getFurnitureById(id);
      
      res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      console.error('Error in getFurniture:', error);
      
      if (error.message === 'Furniture not found') {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to fetch furniture'
      });
    }
  }

  // Update furniture
  async updateFurniture(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Furniture ID is required'
        });
      }

      console.log('Updating furniture with ID:', id);
      
      const result = await furnitureService.updateFurniture(id, req.body, req.file);
      
      res.json({
        success: true,
        data: result.data,
        message: 'Furniture updated successfully'
      });
    } catch (error) {
      console.error('Error in updateFurniture:', error);
      
      if (error.message === 'Furniture not found') {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to update furniture'
      });
    }
  }

  // Delete furniture
  async deleteFurniture(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Furniture ID is required'
        });
      }

      const result = await furnitureService.deleteFurniture(id);
      
      res.json({
        success: true,
        message: result.message || 'Furniture deleted successfully'
      });
    } catch (error) {
      console.error('Error in deleteFurniture:', error);
      
      if (error.message === 'Furniture not found') {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to delete furniture'
      });
    }
  }

  // Get statistics
  async getStatistics(req, res) {
    try {
      const result = await furnitureService.getStatistics();
      
      res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      console.error('Error in getStatistics:', error);
      res.status(200).json({ 
        success: true,
        data: {
          totalItems: 0,
          inStock: 0,
          outOfStock: 0,
          categories: [],
          categoryStats: []
        }
      });
    }
  }

  // Bulk delete furniture
  async bulkDeleteFurniture(req, res) {
    try {
      const { ids } = req.body;
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of furniture IDs to delete'
        });
      }

      const result = await furnitureService.bulkDeleteFurniture(ids);
      
      res.json({
        success: true,
        message: `Deleted ${result.results.length} items, ${result.errors.length} failed`,
        data: {
          successful: result.results,
          failed: result.errors
        }
      });
    } catch (error) {
      console.error('Error in bulkDeleteFurniture:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to bulk delete furniture'
      });
    }
  }

  // Toggle / set active status
  async toggleActiveStatus(req, res) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Furniture ID is required'
        });
      }

      if (isActive === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Active status (isActive) is required'
        });
      }

      const result = await furnitureService.updateFurniture(id, { isActive });

      res.json({
        success: true,
        data: result.data,
        message: `Item ${isActive ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      console.error('Error in toggleActiveStatus:', error);

      if (error.message === 'Furniture not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update active status'
      });
    }
  }

  // Update stock status
  async updateStockStatus(req, res) {
    try {
      const { id } = req.params;
      const { inStock } = req.body;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Furniture ID is required'
        });
      }
      
      if (inStock === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Stock status (inStock) is required'
        });
      }

      const result = await furnitureService.updateFurniture(id, { inStock });
      
      res.json({
        success: true,
        data: result.data,
        message: `Stock status updated to ${inStock ? 'In Stock' : 'Out of Stock'}`
      });
    } catch (error) {
      console.error('Error in updateStockStatus:', error);
      
      if (error.message === 'Furniture not found') {
        return res.status(404).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to update stock status'
      });
    }
  }

  // Get furniture by category
  async getFurnitureByCategory(req, res) {
    try {
      const { category } = req.params;
      
      if (!category) {
        return res.status(400).json({
          success: false,
          message: 'Category is required'
        });
      }

      const result = await furnitureService.getAllFurniture({ category });
      
      res.json({
        success: true,
        data: result.data,
        count: result.data.length,
        category
      });
    } catch (error) {
      console.error('Error in getFurnitureByCategory:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to fetch furniture by category'
      });
    }
  }

  // Search furniture
  async searchFurniture(req, res) {
    try {
      const { q } = req.query;
      
      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
      }

      const result = await furnitureService.getAllFurniture({ search: q });
      
      res.json({
        success: true,
        data: result.data,
        count: result.data.length,
        query: q
      });
    } catch (error) {
      console.error('Error in searchFurniture:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to search furniture'
      });
    }
  }
}

module.exports = new FurnitureController();