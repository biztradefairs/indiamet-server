// src/routes/revenue.js
const express = require('express');
const router = express.Router();
const revenueController = require('../controllers/RevenueController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get revenue summary (admin only)
router.get('/summary', authorize(['admin']), revenueController.getRevenueSummary);

// Combined analytics payload for the admin revenue page
router.get('/analytics', authorize(['admin']), revenueController.getAdminAnalytics);

// Get revenue by sector
router.get('/by-sector', authorize(['admin']), revenueController.getRevenueBySector);

// Get revenue growth
router.get('/growth', authorize(['admin']), revenueController.getRevenueGrowth);

// Get top revenue sources
router.get('/top-sources', authorize(['admin']), revenueController.getTopRevenueSources);

// Export revenue report
router.get('/export', authorize(['admin']), revenueController.exportRevenueReport);

// Get dashboard metrics
router.get('/dashboard-metrics', authorize(['admin']), revenueController.getDashboardMetrics);

// Get revenue forecast
router.get('/forecast', authorize(['admin']), revenueController.getRevenueForecast);

module.exports = router;