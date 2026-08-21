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

  async getAdminAnalytics(timeRange = 'year', year) {
    const sequelize = require('../config/database').getConnection('mysql');
    const now = new Date();
    const selectedYear = Number(year) || now.getFullYear();

    let startDate;
    let endDate;
    switch (timeRange) {
      case 'month':
        startDate = new Date(selectedYear, now.getMonth(), 1);
        endDate = new Date(selectedYear, now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'quarter': {
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(selectedYear, quarterStart, 1);
        endDate = new Date(selectedYear, quarterStart + 3, 0, 23, 59, 59, 999);
        break;
      }
      case 'all':
        startDate = new Date(2000, 0, 1);
        endDate = new Date(selectedYear + 20, 11, 31, 23, 59, 59, 999);
        break;
      case 'year':
      default:
        startDate = new Date(selectedYear, 0, 1);
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    }

    const inRange = (value) => {
      if (!value) return false;
      const date = new Date(value);
      return !Number.isNaN(date.getTime()) && date >= startDate && date <= endDate;
    };

    let invoices = [];
    let payments = [];
    let exhibitorCount = 0;

    try {
      const [rows] = await sequelize.query(`
        SELECT id, amount, status, "issueDate", "paidDate", "exhibitorId", company
        FROM invoices
      `);
      invoices = rows;
    } catch (error) {
      console.warn('Revenue analytics invoices query failed:', error.message);
    }

    try {
      const [rows] = await sequelize.query(`
        SELECT id, amount, status, method, source, date, "exhibitorId"
        FROM payments
      `);
      payments = rows;
    } catch (error) {
      console.warn('Revenue analytics payments query failed:', error.message);
    }

    try {
      const [rows] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM exhibitors`);
      exhibitorCount = rows[0]?.n || 0;
    } catch (error) {
      console.warn('Revenue analytics exhibitors query failed:', error.message);
    }

    const completedPayments = payments.filter((payment) => {
      const status = String(payment.status || '').toLowerCase();
      return ['completed', 'paid', 'success'].includes(status) && inRange(payment.date);
    });

    const paidInvoices = invoices.filter((invoice) => {
      const status = String(invoice.status || '').toLowerCase();
      return status === 'paid' && inRange(invoice.paidDate || invoice.issueDate);
    });

    const revenueRows = completedPayments.length
      ? completedPayments.map((payment) => ({
          amount: Number(payment.amount) || 0,
          date: payment.date,
          exhibitorId: payment.exhibitorId,
          source: payment.method || payment.source || 'Payments'
        }))
      : paidInvoices.map((invoice) => ({
          amount: Number(invoice.amount) || 0,
          date: invoice.paidDate || invoice.issueDate,
          exhibitorId: invoice.exhibitorId,
          source: 'Paid invoices'
        }));

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthsToShow = timeRange === 'month'
      ? [now.getMonth()]
      : timeRange === 'quarter'
        ? [
            Math.floor(now.getMonth() / 3) * 3,
            Math.floor(now.getMonth() / 3) * 3 + 1,
            Math.floor(now.getMonth() / 3) * 3 + 2
          ]
        : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    const monthly = monthsToShow.map((monthIndex) => {
      const rows = revenueRows.filter((row) => {
        const date = new Date(row.date);
        return date.getFullYear() === selectedYear && date.getMonth() === monthIndex;
      });
      const exhibitors = new Set(rows.map((row) => row.exhibitorId).filter(Boolean)).size;
      return {
        month: monthLabels[monthIndex],
        monthIndex,
        revenue: rows.reduce((sum, row) => sum + row.amount, 0),
        exhibitors,
        growth: 0
      };
    });

    monthly.forEach((item, index) => {
      const previous = monthly[index - 1];
      if (!previous || !previous.revenue) {
        item.growth = 0;
        return;
      }
      item.growth = Number((((item.revenue - previous.revenue) / previous.revenue) * 100).toFixed(1));
    });

    const totalRevenue = revenueRows.reduce((sum, row) => sum + row.amount, 0);
    const firstWithRevenue = monthly.find((item) => item.revenue > 0);
    const lastWithRevenue = [...monthly].reverse().find((item) => item.revenue > 0);
    const growthRate = firstWithRevenue && lastWithRevenue && firstWithRevenue !== lastWithRevenue && firstWithRevenue.revenue
      ? Number((((lastWithRevenue.revenue - firstWithRevenue.revenue) / firstWithRevenue.revenue) * 100).toFixed(1))
      : 0;

    const sourceTotals = new Map();
    for (const row of revenueRows) {
      const key = String(row.source || 'Other')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      sourceTotals.set(key, (sourceTotals.get(key) || 0) + row.amount);
    }

    const sourceColors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-gray-500'];
    const sources = [...sourceTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount], index) => ({
        category,
        amount,
        percentage: totalRevenue > 0 ? Number(((amount / totalRevenue) * 100).toFixed(1)) : 0,
        color: sourceColors[index % sourceColors.length]
      }));

    const pendingPayments = payments
      .filter((payment) => String(payment.status || '').toLowerCase() === 'pending' && inRange(payment.date))
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

    const pendingInvoices = invoices
      .filter((invoice) => String(invoice.status || '').toLowerCase() === 'pending' && inRange(invoice.issueDate))
      .reduce((sum, invoice) => sum + (Number(invoice.amount) || 0), 0);

    const years = new Set([selectedYear, now.getFullYear(), now.getFullYear() - 1]);
    for (const invoice of invoices) {
      const date = new Date(invoice.issueDate || invoice.paidDate);
      if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
    }
    for (const payment of payments) {
      const date = new Date(payment.date);
      if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
    }

    return {
      timeRange,
      year: selectedYear,
      totalRevenue,
      growthRate,
      exhibitorCount,
      avgMonthlyRevenue: monthly.length ? totalRevenue / monthly.length : 0,
      pendingPayments,
      pendingInvoices,
      monthly,
      sources,
      years: [...years].filter((value) => value >= 2000 && value <= now.getFullYear() + 1).sort((a, b) => b - a)
    };
  }
}

module.exports = new RevenueService();