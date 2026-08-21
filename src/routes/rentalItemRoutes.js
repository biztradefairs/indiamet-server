const express = require('express');
const router = express.Router();
const rentalItemController = require('../controllers/RentalItemController');
const { authenticate, authorize } = require('../middleware/auth');
const { singleImage } = require('../middleware/imageUpload');

// ======================================================
// TEST ROUTE - To verify routes are working
// ======================================================
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Rental Item API is working!',
    timestamp: new Date().toISOString()
  });
});

// ======================================================
// PUBLIC ROUTES (Accessible without authentication)
// ======================================================

// Get statistics
router.get('/statistics', rentalItemController.getStatistics);

// Get all items with filters - handle both with and without trailing slash
router.get('/', rentalItemController.getAllItems);
router.get('', rentalItemController.getAllItems);

// Get items by category
router.get('/category/:category', rentalItemController.getItemsByCategory);

// Get single item by ID
router.get('/:id', rentalItemController.getItem);

// ======================================================
// ADMIN ROUTES (Protected)
// ======================================================

// Create item
router.post(
  '/',
  authenticate,
  authorize(['admin']),
  singleImage('image'),
  rentalItemController.createItem
);
router.post(
  '',
  authenticate,
  authorize(['admin']),
  singleImage('image'),
  rentalItemController.createItem
);

// Update item
router.put(
  '/:id',
  authenticate,
  authorize(['admin']),
  singleImage('image'),
  rentalItemController.updateItem
);

// Delete item
router.delete(
  '/:id',
  authenticate,
  authorize(['admin']),
  rentalItemController.deleteItem
);

// Bulk delete items
router.delete(
  '/bulk/delete',
  authenticate,
  authorize(['admin']),
  rentalItemController.bulkDeleteItems
);

// Update display order
router.patch(
  '/display-order/update',
  authenticate,
  authorize(['admin']),
  rentalItemController.updateDisplayOrder
);

// Reorder all items
router.post(
  '/reorder',
  authenticate,
  authorize(['admin']),
  rentalItemController.reorderItems
);

// Toggle active status
router.patch(
  '/:id/toggle-status',
  authenticate,
  authorize(['admin']),
  rentalItemController.toggleActiveStatus
);

module.exports = router;