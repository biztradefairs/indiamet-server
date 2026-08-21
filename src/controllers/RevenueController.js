// src/controllers/RevenueController.js
const revenueService = require('../services/RevenueService');

class RevenueController {
  async getAdminAnalytics(req, res) {
    try {
      const { timeRange = 'year', year } = req.query;
      const data = await revenueService.getAdminAnalytics(timeRange, year);
      res.json({
        success: true,
        data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getRevenueSummary(req, res) {
    try {
      const { timeRange = 'month' } = req.query;
      const summary = await revenueService.getRevenueSummary(timeRange);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getRevenueBySector(req, res) {
    try {
      const bySector = await revenueService.getRevenueBySector();
      
      res.json({
        success: true,
        data: bySector
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getRevenueGrowth(req, res) {
    try {
      const { periods = 12 } = req.query;
      const growth = await revenueService.getRevenueGrowth(parseInt(periods));
      
      res.json({
        success: true,
        data: growth
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getTopRevenueSources(req, res) {
    try {
      const { limit = 5 } = req.query;
      const topSources = await revenueService.getTopRevenueSources(parseInt(limit));
      
      res.json({
        success: true,
        data: topSources
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async exportRevenueReport(req, res) {
    try {
      const { format = 'json', startDate, endDate } = req.query;
      
      const result = await revenueService.exportRevenueReport(
        format, 
        startDate || new Date(0),
        endDate || new Date()
      );
      
      if (format === 'json') {
        res.json({
          success: true,
          data: result.data
        });
      } else if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.data);
      } else if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.data);
      } else {
        throw new Error('Unsupported format');
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getDashboardMetrics(req, res) {
    try {
      // Get multiple metrics in parallel for dashboard
      const [summary, growth, topSources] = await Promise.all([
        revenueService.getRevenueSummary('month'),
        revenueService.getRevenueGrowth(6),
        revenueService.getTopRevenueSources(3)
      ]);
      
      // Additional metrics
      const metrics = {
        totalRevenue: summary.totalRevenue,
        totalInvoices: summary.totalInvoices,
        monthlyGrowth: growth.totalGrowth,
        topSources,
        // Add more dashboard metrics as needed
        activeExhibitors: 0, // This would come from ExhibitorService
        pendingPayments: 0, // This would come from PaymentService
        upcomingInvoices: 0  // This would come from InvoiceService
      };
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getRevenueForecast(req, res) {
    try {
      const { months = 6 } = req.query;
      
      // Simple forecasting based on historical growth
      const historical = await revenueService.getRevenueGrowth(parseInt(months));
      const averageMonthlyGrowth = historical.monthlyData.length > 1 
        ? historical.monthlyData.slice(-3).reduce((sum, item) => sum + item.growth, 0) / 3
        : 0;
      
      const lastRevenue = historical.monthlyData.length > 0 
        ? historical.monthlyData[historical.monthlyData.length - 1].revenue
        : 0;
      
      // Generate forecast for next X months
      const forecast = [];
      let currentRevenue = lastRevenue;
      
      for (let i = 1; i <= parseInt(months); i++) {
        const projectedRevenue = currentRevenue * (1 + averageMonthlyGrowth / 100);
        forecast.push({
          month: `Month +${i}`,
          projectedRevenue: parseFloat(projectedRevenue.toFixed(2)),
          growth: averageMonthlyGrowth
        });
        currentRevenue = projectedRevenue;
      }
      
      res.json({
        success: true,
        data: {
          forecast,
          averageMonthlyGrowth,
          assumptions: 'Based on historical growth patterns'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new RevenueController();