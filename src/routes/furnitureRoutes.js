const express = require('express');
const router = express.Router();
const furnitureController = require('../controllers/FurnitureController');
const { authenticate, authorize } = require('../middleware/auth');
const { singleImage } = require('../middleware/imageUpload');

// ======================================================
// TEST ROUTE - To verify routes are working
// ======================================================
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Furniture API is working!',
    timestamp: new Date().toISOString()
  });
});

// ======================================================
// PUBLIC ROUTES (Accessible without authentication)
// ======================================================

// Get statistics
router.get('/statistics', furnitureController.getStatistics);

// Get all furniture with filters - handle both with and without trailing slash
router.get('/', furnitureController.getAllFurniture);
router.get('', furnitureController.getAllFurniture);

// Search furniture
router.get('/search', furnitureController.searchFurniture);

// Get furniture by category
router.get('/category/:category', furnitureController.getFurnitureByCategory);

// Get single furniture by ID
router.get('/:id', furnitureController.getFurniture);

// ======================================================
// ADMIN ROUTES (Protected)
// ======================================================

// Create furniture
router.post(
  '/',
  authenticate,
  authorize(['admin']),
  singleImage('image'),
  furnitureController.createFurniture
);
router.post(
  '',
  authenticate,
  authorize(['admin']),
  singleImage('image'),
  furnitureController.createFurniture
);

// Update furniture
router.put(
  '/:id',
  authenticate,
  authorize(['admin']),
  singleImage('image'),
  furnitureController.updateFurniture
);

// Delete furniture
router.delete(
  '/:id',
  authenticate,
  authorize(['admin']),
  furnitureController.deleteFurniture
);

// Bulk delete furniture
router.delete(
  '/bulk/delete',
  authenticate,
  authorize(['admin']),
  furnitureController.bulkDeleteFurniture
);

// Update stock status
router.patch(
  '/:id/stock',
  authenticate,
  authorize(['admin']),
  furnitureController.updateStockStatus
);

// Toggle active status
router.patch(
  '/:id',
  authenticate,
  authorize(['admin']),
  furnitureController.toggleActiveStatus
);

module.exports = router;