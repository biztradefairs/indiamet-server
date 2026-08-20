// src/services/RevenueService.js
const { Op, Sequelize } = require('sequelize');

class RevenueService {
  constructor() {
    this._paymentModel = null;
    this._invoiceModel = null;
    this._exhibitorModel = null;
  }

  // Lazy getter for Payment model
  get Payment() {
    if (!this._paymentModel) {
      const modelFactory = require('../models');
      this._paymentModel = modelFactory.getModel('Payment');
    }
    return this._paymentModel;
  }

  // Lazy getter for Invoice model
  get Invoice() {
    if (!this._invoiceModel) {
      const modelFactory = require('../models');
      this._invoiceModel = modelFactory.getModel('Invoice');
    }
    return this._invoiceModel;
  }

  // Lazy getter for Exhibitor model
  get Exhibitor() {
    if (!this._exhibitorModel) {
      const modelFactory = require('../models');
      this._exhibitorModel = modelFactory.getModel('Exhibitor');
    }
    return this._exhibitorModel;
  }

  async getRevenueSummary(timeRange = 'month') {
    try {
      const now = new Date();
      let startDate, endDate = new Date();
      
      // Set date range based on timeRange
      switch (timeRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'quarter':
          startDate = new Date(now.setMonth(now.getMonth() - 3));
          break;
        case 'year':
          startDate = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
        default:
          startDate = new Date(0);
      }
      
      if (process.env.DB_TYPE !== 'mongodb') {
        // Get total revenue from completed payments
        const totalRevenue = await this.Payment.sum('amount', {
          where: {
            status: 'completed',
            date: { [Op.between]: [startDate, endDate] }
          }
        });
        
        // Get total invoices
        const totalInvoices = await this.Invoice.sum('amount', {
          where: {
            status: 'paid',
            paidDate: { [Op.between]: [startDate, endDate] }
          }
        });
        
        // Get pending payments amount
        const pendingPayments = await this.Payment.sum('amount', {
          where: {
            status: 'pending',
            date: { [Op.between]: [startDate, endDate] }
          }
        });
        
        // Get revenue by source
        const bySource = await this.Payment.findAll({
          attributes: [
            'source',
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']
          ],
          where: {
            status: 'completed',
            date: { [Op.between]: [startDate, endDate] }
          },
          group: ['source']
        });
        
        // Get monthly trend
        const monthlyTrend = await this.Payment.findAll({
          attributes: [
            [Sequelize.fn('to_char', Sequelize.col('date'), 'YYYY-MM'), 'month'],
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']
          ],
          where: {
            status: 'completed',
            date: { [Op.between]: [startDate, endDate] }
          },
          group: [Sequelize.fn('to_char', Sequelize.col('date'), 'YYYY-MM')],
          order: [[Sequelize.fn('to_char', Sequelize.col('date'), 'YYYY-MM'), 'ASC']]
        });
        
        return {
          totalRevenue: totalRevenue || 0,
          totalInvoices: totalInvoices || 0,
          pendingPayments: pendingPayments || 0,
          bySource,
          monthlyTrend,
          timeRange
        };
      } else {
        // MongoDB implementation
        const totalRevenue = await this.Payment.aggregate([
          { $match: { 
            status: 'completed',
            date: { $gte: startDate, $lte: endDate }
          }},
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const totalInvoices = await this.Invoice.aggregate([
          { $match: { 
            status: 'paid',
            paidDate: { $gte: startDate, $lte: endDate }
          }},
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const pendingPayments = await this.Payment.aggregate([
          { $match: { 
            status: 'pending',
            date: { $gte: startDate, $lte: endDate }
          }},
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const bySource = await this.Payment.aggregate([
          { $match: { 
            status: 'completed',
            date: { $gte: startDate, $lte: endDate }
          }},
          { $group: { 
            _id: '$source',
            count: { $sum: 1 },
            total: { $sum: '$amount' }
          }}
        ]);
        
        const monthlyTrend = await this.Payment.aggregate([
          { $match: { 
            status: 'completed',
            date: { $gte: startDate, $lte: endDate }
          }},
          { $group: { 
            _id: { 
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            count: { $sum: 1 },
            total: { $sum: '$amount' }
          }},
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);
        
        return {
          totalRevenue: totalRevenue[0]?.total || 0,
          totalInvoices: totalInvoices[0]?.total || 0,
          pendingPayments: pendingPayments[0]?.total || 0,
          bySource,
          monthlyTrend,
          timeRange
        };
      }
    } catch (error) {
      throw new Error(`Failed to get revenue summary: ${error.message}`);
    }
  }

  async getRevenueBySector() {
    try {
      if (process.env.DB_TYPE !== 'mongodb') {
        // Join payments with exhibitors to get revenue by sector
        const revenueBySector = await this.Exhibitor.findAll({
          attributes: [
            'sector',
            [Sequelize.fn('COUNT', Sequelize.col('Exhibitor.id')), 'exhibitorCount']
          ],
          where: {
            sector: { [Op.not]: null }
          },
          group: ['sector'],
          order: [[Sequelize.col('exhibitorCount'), 'DESC']]
        });
        
        // Add revenue data
        for (const sector of revenueBySector) {
          const sectorRevenue = await this.Payment.sum('amount', {
            include: [{
              model: this.Exhibitor,
              as: 'exhibitor',
              where: { sector: sector.sector }
            }],
            where: { status: 'completed' }
          });
          
          sector.dataValues.totalRevenue = sectorRevenue || 0;
        }
        
        return revenueBySector;
      } else {
        // MongoDB implementation using aggregation with lookup
        const revenueBySector = await this.Exhibitor.aggregate([
          { $match: { sector: { $ne: null } } },
          { $lookup: {
            from: 'payments',
            localField: '_id',
            foreignField: 'exhibitorId',
            as: 'payments'
          }},
          { $addFields: {
            completedPayments: {
              $filter: {
                input: '$payments',
                as: 'payment',
                cond: { $eq: ['$$payment.status', 'completed'] }
              }
            }
          }},
          { $addFields: {
            totalRevenue: { $sum: '$completedPayments.amount' },
            paymentCount: { $size: '$completedPayments' }
          }},
          { $group: {
            _id: '$sector',
            exhibitorCount: { $sum: 1 },
            totalRevenue: { $sum: '$totalRevenue' },
            totalPayments: { $sum: '$paymentCount' }
          }},
          { $sort: { totalRevenue: -1 } }
        ]);
        
        return revenueBySector;
      }
    } catch (error) {
      throw new Error(`Failed to get revenue by sector: ${error.message}`);
    }
  }

  async getRevenueGrowth(periods = 12) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - periods);
      
      if (process.env.DB_TYPE !== 'mongodb') {
        const monthlyRevenue = await this.Payment.findAll({
          attributes: [
            [Sequelize.fn('to_char', Sequelize.col('date'), 'YYYY-MM'), 'month'],
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'revenue']
          ],
          where: {
            status: 'completed',
            date: { [Op.between]: [startDate, endDate] }
          },
          group: [Sequelize.fn('to_char', Sequelize.col('date'), 'YYYY-MM')],
          order: [[Sequelize.fn('to_char', Sequelize.col('date'), 'YYYY-MM'), 'ASC']]
        });
        
        // Calculate growth percentage
        const revenueData = monthlyRevenue.map((item, index, array) => {
          const revenue = parseFloat(item.dataValues.revenue) || 0;
          const growth = index > 0 
            ? ((revenue - parseFloat(array[index - 1].dataValues.revenue)) / parseFloat(array[index - 1].dataValues.revenue) * 100).toFixed(2)
            : 0;
          
          return {
            month: item.dataValues.month,
            revenue,
            growth: parseFloat(growth)
          };
        });
        
        const totalGrowth = revenueData.length > 1
          ? ((revenueData[revenueData.length - 1].revenue - revenueData[0].revenue) / revenueData[0].revenue * 100).toFixed(2)
          : 0;
        
        return {
          monthlyData: revenueData,
          totalGrowth: parseFloat(totalGrowth),
          averageMonthlyRevenue: revenueData.reduce((sum, item) => sum + item.revenue, 0) / revenueData.length
        };
      } else {
        const monthlyRevenue = await this.Payment.aggregate([
          { $match: { 
            status: 'completed',
            date: { $gte: startDate, $lte: endDate }
          }},
          { $group: { 
            _id: { 
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            revenue: { $sum: '$amount' }
          }},
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);
        
        // Format data and calculate growth
        const formattedData = monthlyRevenue.map((item, index, array) => {
          const month = `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`;
          const revenue = item.revenue || 0;
          const growth = index > 0 
            ? ((revenue - array[index - 1].revenue) / array[index - 1].revenue * 100).toFixed(2)
            : 0;
          
          return {
            month,
            revenue,
            growth: parseFloat(growth)
          };
        });
        
        const totalGrowth = formattedData.length > 1
          ? ((formattedData[formattedData.length - 1].revenue - formattedData[0].revenue) / formattedData[0].revenue * 100).toFixed(2)
          : 0;
        
        return {
          monthlyData: formattedData,
          totalGrowth: parseFloat(totalGrowth),
          averageMonthlyRevenue: formattedData.reduce((sum, item) => sum + item.revenue, 0) / formattedData.length
        };
      }
    } catch (error) {
      throw new Error(`Failed to get revenue growth: ${error.message}`);
    }
  }

  async getTopRevenueSources(limit = 5) {
    try {
      if (process.env.DB_TYPE !== 'mongodb') {
        const topSources = await this.Payment.findAll({
          attributes: [
            'source',
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']
          ],
          where: {
            status: 'completed'
          },
          group: ['source'],
          order: [[Sequelize.fn('SUM', Sequelize.col('amount')), 'DESC']],
          limit
        });
        
        return topSources;
      } else {
        const topSources = await this.Payment.aggregate([
          { $match: { status: 'completed' } },
          { $group: { 
            _id: '$source',
            count: { $sum: 1 },
            total: { $sum: '$amount' }
          }},
          { $sort: { total: -1 } },
          { $limit: limit }
        ]);
        
        return topSources;
      }
    } catch (error) {
      throw new Error(`Failed to get top revenue sources: ${error.message}`);
    }
  }

  async getDashboardMetrics() {
    try {
      // Get multiple metrics in parallel for dashboard
      const [revenueSummary, revenueGrowth, topSources] = await Promise.all([
        this.getRevenueSummary('month'),
        this.getRevenueGrowth(6),
        this.getTopRevenueSources(3)
      ]);
      
      // Get total exhibitors
      let totalExhibitors = 0;
      try {
        const exhibitorService = require('./ExhibitorService');
        const exhibitors = await exhibitorService.getAllExhibitors({}, 1, 1);
        totalExhibitors = exhibitors.total || 0;
      } catch (error) {
        console.warn('Failed to get exhibitors count:', error.message);
      }
      
      // Get pending invoices count
      let pendingInvoices = 0;
      try {
        if (process.env.DB_TYPE !== 'mongodb') {
          pendingInvoices = await this.Invoice.count({
            where: { status: 'pending' }
          });
        } else {
          pendingInvoices = await this.Invoice.countDocuments({ status: 'pending' });
        }
      } catch (error) {
        console.warn('Failed to get pending invoices:', error.message);
      }
      
      const metrics = {
        totalRevenue: revenueSummary.totalRevenue,
        totalInvoices: revenueSummary.totalInvoices,
        pendingPayments: revenueSummary.pendingPayments || 0,
        monthlyGrowth: revenueGrowth.totalGrowth || 0,
        topSources,
        totalExhibitors,
        pendingInvoices,
        revenueByMonth: revenueGrowth.monthlyData?.slice(-6) || [] // Last 6 months
      };
      
      return metrics;
    } catch (error) {
      throw new Error(`Failed to get dashboard metrics: ${error.message}`);
    }
  }

  async getRevenueForecast(months = 6) {
    try {
      // Simple forecasting based on historical growth
      const historical = await this.getRevenueGrowth(parseInt(months));
      const averageMonthlyGrowth = historical.monthlyData.length > 1 
        ? historical.monthlyData.slice(-3).reduce((sum, item) => sum + (item.growth || 0), 0) / 3
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
      
      return {
        forecast,
        averageMonthlyGrowth,
        assumptions: 'Based on historical growth patterns from the last 3 months'
      };
    } catch (error) {
      throw new Error(`Failed to get revenue forecast: ${error.message}`);
    }
  }
}

module.exports = new RevenueService();